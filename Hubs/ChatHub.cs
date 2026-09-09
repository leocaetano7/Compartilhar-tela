using DiscordClone.Data;
using Microsoft.AspNetCore.SignalR;
using Npgsql;
using System.Collections.Concurrent;

namespace DiscordClone.Hubs;

public class ChatHub : Hub
{
    private readonly Db _db;

    private static readonly ConcurrentDictionary<int, List<(string ConnectionId, string Usuario)>> ParticipantesChamada = new();
    public ChatHub(Db db)
    {
        _db = db;
    }

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

        var lista = ParticipantesChamada.GetOrAdd(canalId, _ => new List<(string, string)>());
        lock (lista)
        {
            lista.Add((Context.ConnectionId, nome));
        }

        await Clients.OthersInGroup(grupo).SendAsync("novoParticipanteChamada", new
        {
            peerId,
            usuario = nome,
        });

        await AtualizarListaDeParticipantes(canalId);
    }
    
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var canalId in ParticipantesChamada.Keys.ToList())
        {
            var lista = ParticipantesChamada[canalId];
            lock (lista)
            {
                lista.RemoveAll(p => p.ConnectionId == Context.ConnectionId);
            }
            await AtualizarListaDeParticipantes(canalId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task AtualizarListaDeParticipantes(int canalId)
    {
        var grupo = "canal-" + canalId;
        var lista = ParticipantesChamada.GetOrAdd(canalId, _ => new List<(string, string)>());

        List<string> nomes;
        lock (lista)
        {
            nomes = lista.Select(p => p.Usuario).ToList();
        }

        await Clients.Group(grupo).SendAsync("participantesChamada", nomes);
    }
}
    