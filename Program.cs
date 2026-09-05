using DiscordClone.Data;
using DiscordClone.Hubs;
using Npgsql;
using System.Security.Cryptography;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new Exception("Configure a variável DATABASE_URL");

// O Supabase manda a URL no formato postgresql://usuario:senha@host:porta/banco
// e o Npgsql entende melhor no formato "Host=...;Port=...". Convertendo aqui:
var connectionStringNpgsql = ConverterUrlParaNpgsql(connectionString);

var db = new Db(connectionStringNpgsql);
builder.Services.AddSingleton(db);

var app = builder.Build();

await db.CriarTabelasAsync();

app.UseDefaultFiles();
app.UseStaticFiles();

// ---------- "SESSÃO" SIMPLES USANDO UM TOKEN GUARDADO NO BANCO ----------
// Em vez de usar sessão em memória (que se perde quando o servidor reinicia),
// guardamos um token aleatório no banco, e um cookie no navegador com esse token.

async Task<(int Id, string Username)?> PegarUsuarioLogado(HttpContext contexto, Db db)
{
    if (!contexto.Request.Cookies.TryGetValue("sessionToken", out var token) || string.IsNullOrEmpty(token))
        return null;

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();
    await using var comando = new NpgsqlCommand(
        @"SELECT discord_users.id, discord_users.username
          FROM discord_sessions
          JOIN discord_users ON discord_users.id = discord_sessions.user_id
          WHERE discord_sessions.token = $1", conexao);
    comando.Parameters.AddWithValue(token);

    await using var leitor = await comando.ExecuteReaderAsync();
    if (await leitor.ReadAsync())
        return (leitor.GetInt32(0), leitor.GetString(1));

    return null;
}

async Task CriarSessao(HttpContext contexto, Db db, int userId)
{
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();
    await using var comando = new NpgsqlCommand(
        "INSERT INTO discord_sessions (token, user_id) VALUES ($1, $2)", conexao);
    comando.Parameters.AddWithValue(token);
    comando.Parameters.AddWithValue(userId);
    await comando.ExecuteNonQueryAsync();

    contexto.Response.Cookies.Append("sessionToken", token, new CookieOptions
    {
        HttpOnly = true,
        Expires = DateTimeOffset.UtcNow.AddDays(7),
        SameSite = SameSiteMode.Lax,
    });
}

// ---------- LOGIN / CADASTRO ----------

app.MapPost("/api/registrar", async (HttpContext contexto, Db db) =>
{
    var corpo = await JsonSerializer.DeserializeAsync<JsonElement>(contexto.Request.Body);
    var username = corpo.GetProperty("username").GetString();
    var password = corpo.GetProperty("password").GetString();

    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        return Results.BadRequest(new { erro = "Preencha usuário e senha" });

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();

    await using (var verifica = new NpgsqlCommand("SELECT id FROM discord_users WHERE username = $1", conexao))
    {
        verifica.Parameters.AddWithValue(username);
        var existente = await verifica.ExecuteScalarAsync();
        if (existente != null)
            return Results.BadRequest(new { erro = "Esse nome de usuário já existe" });
    }

    var hash = BCrypt.Net.BCrypt.HashPassword(password);
    int novoId;

    await using (var insere = new NpgsqlCommand(
        "INSERT INTO discord_users (username, password_hash) VALUES ($1, $2) RETURNING id", conexao))
    {
        insere.Parameters.AddWithValue(username);
        insere.Parameters.AddWithValue(hash);
        novoId = (int)(await insere.ExecuteScalarAsync())!;
    }

    await CriarSessao(contexto, db, novoId);
    return Results.Ok(new { usuario = new { id = novoId, username } });
});

app.MapPost("/api/login", async (HttpContext contexto, Db db) =>
{
    var corpo = await JsonSerializer.DeserializeAsync<JsonElement>(contexto.Request.Body);
    var username = corpo.GetProperty("username").GetString();
    var password = corpo.GetProperty("password").GetString();

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();

    await using var comando = new NpgsqlCommand(
        "SELECT id, password_hash FROM discord_users WHERE username = $1", conexao);
    comando.Parameters.AddWithValue(username!);

    await using var leitor = await comando.ExecuteReaderAsync();
    if (!await leitor.ReadAsync())
        return Results.BadRequest(new { erro = "Usuário ou senha errados" });

    var id = leitor.GetInt32(0);
    var hash = leitor.GetString(1);
    await leitor.CloseAsync();

    if (!BCrypt.Net.BCrypt.Verify(password, hash))
        return Results.BadRequest(new { erro = "Usuário ou senha errados" });

    await CriarSessao(contexto, db, id);
    return Results.Ok(new { usuario = new { id, username } });
});

app.MapPost("/api/logout", async (HttpContext contexto, Db db) =>
{
    if (contexto.Request.Cookies.TryGetValue("sessionToken", out var token))
    {
        await using var conexao = db.CriarConexao();
        await conexao.OpenAsync();
        await using var comando = new NpgsqlCommand("DELETE FROM discord_sessions WHERE token = $1", conexao);
        comando.Parameters.AddWithValue(token);
        await comando.ExecuteNonQueryAsync();
    }
    contexto.Response.Cookies.Delete("sessionToken");
    return Results.Ok(new { ok = true });
});

app.MapGet("/api/me", async (HttpContext contexto, Db db) =>
{
    var usuario = await PegarUsuarioLogado(contexto, db);
    if (usuario == null) return Results.Unauthorized();
    return Results.Ok(new { usuario = new { id = usuario.Value.Id, username = usuario.Value.Username } });
});

// ---------- CANAIS ----------

app.MapGet("/api/canais", async (HttpContext contexto, Db db) =>
{
    var usuario = await PegarUsuarioLogado(contexto, db);
    if (usuario == null) return Results.Unauthorized();

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();
    await using var comando = new NpgsqlCommand(@"
        SELECT discord_channels.id, discord_channels.name, discord_channels.invite_code
        FROM discord_channels
        JOIN discord_channel_members ON discord_channel_members.channel_id = discord_channels.id
        WHERE discord_channel_members.user_id = $1
        ORDER BY discord_channels.created_at", conexao);
    comando.Parameters.AddWithValue(usuario.Value.Id);

    var canais = new List<object>();
    await using var leitor = await comando.ExecuteReaderAsync();
    while (await leitor.ReadAsync())
    {
        canais.Add(new { id = leitor.GetInt32(0), name = leitor.GetString(1), invite_code = leitor.GetString(2) });
    }

    return Results.Ok(new { canais });
});

app.MapPost("/api/canais", async (HttpContext contexto, Db db) =>
{
    var usuario = await PegarUsuarioLogado(contexto, db);
    if (usuario == null) return Results.Unauthorized();

    var corpo = await JsonSerializer.DeserializeAsync<JsonElement>(contexto.Request.Body);
    var nome = corpo.GetProperty("nome").GetString();
    if (string.IsNullOrWhiteSpace(nome))
        return Results.BadRequest(new { erro = "Dê um nome pro canal" });

    var codigoConvite = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLower();

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();

    int canalId;
    await using (var insere = new NpgsqlCommand(
        "INSERT INTO discord_channels (name, invite_code, created_by) VALUES ($1, $2, $3) RETURNING id", conexao))
    {
        insere.Parameters.AddWithValue(nome);
        insere.Parameters.AddWithValue(codigoConvite);
        insere.Parameters.AddWithValue(usuario.Value.Id);
        canalId = (int)(await insere.ExecuteScalarAsync())!;
    }

    await using (var membro = new NpgsqlCommand(
        "INSERT INTO discord_channel_members (channel_id, user_id) VALUES ($1, $2)", conexao))
    {
        membro.Parameters.AddWithValue(canalId);
        membro.Parameters.AddWithValue(usuario.Value.Id);
        await membro.ExecuteNonQueryAsync();
    }

    return Results.Ok(new { canal = new { id = canalId, name = nome, invite_code = codigoConvite } });
});

app.MapPost("/api/canais/entrar", async (HttpContext contexto, Db db) =>
{
    var usuario = await PegarUsuarioLogado(contexto, db);
    if (usuario == null) return Results.Unauthorized();

    var corpo = await JsonSerializer.DeserializeAsync<JsonElement>(contexto.Request.Body);
    var codigo = corpo.GetProperty("codigo").GetString();

    await using var conexao = db.CriarConexao();
    await conexao.OpenAsync();

    int canalId;
    string nome;
    await using (var busca = new NpgsqlCommand("SELECT id, name FROM discord_channels WHERE invite_code = $1", conexao))
    {
        busca.Parameters.AddWithValue(codigo!);
        await using var leitor = await busca.ExecuteReaderAsync();
        if (!await leitor.ReadAsync())
            return Results.NotFound(new { erro = "Código de convite inválido" });
        canalId = leitor.GetInt32(0);
        nome = leitor.GetString(1);
    }

    await using (var membro = new NpgsqlCommand(
        "INSERT INTO discord_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", conexao))
    {
        membro.Parameters.AddWithValue(canalId);
        membro.Parameters.AddWithValue(usuario.Value.Id);
        await membro.ExecuteNonQueryAsync();
    }

    return Results.Ok(new { canal = new { id = canalId, name = nome, invite_code = codigo } });
});

app.MapHub<ChatHub>("/chathub");

app.Run();

// Converte a URL estilo "postgresql://usuario:senha@host:porta/banco" pro formato do Npgsql
static string ConverterUrlParaNpgsql(string url)
{
    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':');
    var usuario = Uri.UnescapeDataString(userInfo[0]);
    var senha = Uri.UnescapeDataString(userInfo[1]);
    var banco = uri.AbsolutePath.TrimStart('/');

    return $"Host={uri.Host};Port={uri.Port};Database={banco};Username={usuario};Password={senha};SSL Mode=Require;Trust Server Certificate=true";
}
