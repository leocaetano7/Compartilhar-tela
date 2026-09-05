using DiscordClone.Data;
using Microsoft.AspNetCore.SignalR;
using Npgsql;

namespace DiscordClone.Hubs;

// Isso é o equivalente ao "io.on('connection', ...)" que tínhamos no Node.js.
public class ChatHub : Hub
{
    private readonly Db _db;

    public ChatHub(Db db)
    {
        _db = db;
    }

    // Descobre quem é o usuário logado a partir do cookie da conexão
    private async Task<string> PegarNomeUsuario()
    {
        var contextoHttp = Context.GetHttpContext();
        if (contextoHttp == null || !contextoHttp.Request.Cookies.TryGetValue("sessionToken", out var token))
            return "Alguém";

        await using var conexao = _db.CriarConexao();
        await conexao.OpenAsync();
        await using var comando = new NpgsqlCommand(@"
            SELECT discord_users.username
            FROM discord_sessions
            JOIN discord_users ON discord_users.id = discord_sessions.user_id
            WHERE discord_sessions.token = $1", conexao);
        comando.Parameters.AddWithValue(token);

        var resultado = await comando.ExecuteScalarAsync();
        return resultado as string ?? "Alguém";
    }

    public async Task EntrarCanal(int canalId)
    {
        var grupo = "canal-" + canalId;
        await Groups.AddToGroupAsync(Context.ConnectionId, grupo);

        var nome = await PegarNomeUsuario();
        await Clients.Group(grupo).SendAsync("mensagemSistema", $"{nome} entrou no canal");
    }

    public async Task Mensagem(int canalId, string texto)
    {
        var nome = await PegarNomeUsuario();
        var grupo = "canal-" + canalId;

        await Clients.Group(grupo).SendAsync("novaMensagem", new
        {
            usuario = nome,
            texto,
            hora = DateTime.Now.ToString("HH:mm:ss"),
        });
    }

    public async Task EntrarChamada(int canalId, string peerId)
    {
        var nome = await PegarNomeUsuario();
        var grupo = "canal-" + canalId;

        await Clients.OthersInGroup(grupo).SendAsync("novoParticipanteChamada", new
        {
            peerId,
            usuario = nome,
        });
    }
}
