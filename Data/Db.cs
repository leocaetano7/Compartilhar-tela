using Npgsql;

namespace DiscordClone.Data;

public class Db
{
    private readonly string _connectionString;

    public Db(string connectionString)
    {
        _connectionString = connectionString;
    }

    public NpgsqlConnection CriarConexao()
    {
        return new NpgsqlConnection(_connectionString);
    }

    public async Task CriarTabelasAsync()
    {
        await using var conexao = CriarConexao();
        await conexao.OpenAsync();

        await ExecutarAsync(conexao, @"
            CREATE TABLE IF NOT EXISTS discord_users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );");

        await ExecutarAsync(conexao, @"
            CREATE TABLE IF NOT EXISTS discord_channels (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                invite_code TEXT UNIQUE NOT NULL,
                created_by INTEGER REFERENCES discord_users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );");

        await ExecutarAsync(conexao, @"
            CREATE TABLE IF NOT EXISTS discord_channel_members (
                channel_id INTEGER REFERENCES discord_channels(id),
                user_id INTEGER REFERENCES discord_users(id),
                PRIMARY KEY (channel_id, user_id)
            );");


        await ExecutarAsync(conexao, @"
            CREATE TABLE IF NOT EXISTS discord_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES discord_users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );");

        Console.WriteLine("Tabelas do banco de dados prontas.");
    }


    public async Task SemearCanaisAsync()
    {
        await using var conexao = CriarConexao();
        await conexao.OpenAsync();

        await using var contagem = new NpgsqlCommand("SELECT COUNT(*) FROM discord_channels", conexao);
        var total = (long)(await contagem.ExecuteScalarAsync())!;
        if (total > 0) return; 

        var nomes = new[] { "Geral", "Estudos", "Memes", "Jogos", "Música", "Trabalhos", "Dúvidas", "Filmes", "Off-topic", "Anúncios" };

        foreach (var nome in nomes)
        {
            var codigo = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(4)).ToLower();
            await using var insere = new NpgsqlCommand(
                "INSERT INTO discord_channels (name, invite_code) VALUES ($1, $2)", conexao);
            insere.Parameters.AddWithValue(nome);
            insere.Parameters.AddWithValue(codigo);
            await insere.ExecuteNonQueryAsync();
        }

        Console.WriteLine("10 canais padrão criados.");
    }

    private static async Task ExecutarAsync(NpgsqlConnection conexao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync();
    }
}