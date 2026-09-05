using Npgsql;

namespace DiscordClone.Data;

// Esta classe cuida da conexão com o banco e garante que as tabelas existem.
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

        // Guarda as sessões de login no banco, pra não perder quando o servidor reiniciar
        // (o mesmo problema que resolvemos na versão Node.js, resolvido aqui do mesmo jeito).
        await ExecutarAsync(conexao, @"
            CREATE TABLE IF NOT EXISTS discord_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES discord_users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );");

        Console.WriteLine("Tabelas do banco de dados prontas.");
    }

    private static async Task ExecutarAsync(NpgsqlConnection conexao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync();
    }
}
