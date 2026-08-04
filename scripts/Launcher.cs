using System;
using System.Diagnostics;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

class Launcher
{
    [STAThread]
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;

        bool serverRunning = false;
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect("127.0.0.1", 5173, null, null);
                serverRunning = result.AsyncWaitHandle.WaitOne(300);
                if (serverRunning) client.EndConnect(result);
            }
        }
        catch
        {
            serverRunning = false;
        }

        if (!serverRunning)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = "server.js",
                WorkingDirectory = dir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            try
            {
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Nao foi possivel iniciar o servidor do jogo.\n\n" +
                    "Verifique se o Node.js esta instalado (https://nodejs.org).\n\n" +
                    "Detalhe: " + ex.Message,
                    "NOVO POKE IDLE",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            // Give the static file server a moment to bind the port before
            // the browser's first request lands.
            Thread.Sleep(1200);
        }

        try
        {
            Process.Start(new ProcessStartInfo("http://localhost:5173") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "O servidor iniciou, mas nao foi possivel abrir o navegador automaticamente.\n" +
                "Abra manualmente: http://localhost:5173\n\nDetalhe: " + ex.Message,
                "NOVO POKE IDLE",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
