$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8000)

try {
    $listener.Start()
} catch {
    Write-Host 'No se pudo iniciar el servidor local en el puerto 8000. Puede que ya haya otro servidor usándolo.' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Read-Host 'Presiona Enter para cerrar'
    exit 1
}

$url = 'http://127.0.0.1:8000/'
Write-Host "Torneo disponible en $url" -ForegroundColor Cyan
Write-Host 'Deja esta ventana abierta. Presiona Ctrl+C para detener el servidor.' -ForegroundColor Gray
Start-Process $url

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'
    '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.glb' = 'model/gltf-binary'
    '.gltf' = 'model/gltf+json'; '.bin' = 'application/octet-stream'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
}

try {
    while ($listener) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        try {
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($null -ne ($header = $reader.ReadLine()) -and $header.Length -gt 0) { }
            $parts = if ($requestLine) { $requestLine.Split(' ') } else { @() }
            $status = '200 OK'
            $contentType = 'text/plain; charset=utf-8'
            $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found')

            if ($parts.Count -lt 2 -or ($parts[0] -ne 'GET' -and $parts[0] -ne 'HEAD')) {
                $status = '405 Method Not Allowed'
                $body = [Text.Encoding]::UTF8.GetBytes('405 Method Not Allowed')
            } else {
                $relativePath = [Uri]::UnescapeDataString(([Uri]::new('http://localhost' + $parts[1])).AbsolutePath.TrimStart('/'))
                if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath.EndsWith('/')) { $relativePath += 'index.html' }
                $filePath = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
                $insideRoot = $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)

                if (-not $insideRoot) {
                    $status = '403 Forbidden'
                    $body = [Text.Encoding]::UTF8.GetBytes('403 Forbidden')
                } elseif ([IO.File]::Exists($filePath)) {
                    $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
                    if ($mimeTypes.ContainsKey($extension)) { $contentType = $mimeTypes[$extension] }
                    else { $contentType = 'application/octet-stream' }
                    $body = [IO.File]::ReadAllBytes($filePath)
                } else {
                    $status = '404 Not Found'
                    $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
                }
            }

            $bodyLength = $body.Length
            $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $bodyLength`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n`r`n"
            $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
            $stream.Write($headBytes, 0, $headBytes.Length)
            if ($parts.Count -ge 1 -and $parts[0] -ne 'HEAD' -and $bodyLength -gt 0) { $stream.Write($body, 0, $bodyLength) }
        } catch {
            Write-Host "Error al responder una solicitud: $($_.Exception.Message)" -ForegroundColor Yellow
        } finally {
            $stream.Dispose()
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}