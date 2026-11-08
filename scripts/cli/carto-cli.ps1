# Carto - export par lot en ligne de commande (Windows, PowerShell)
#   .\carto-cli.ps1 --input <dossier> --output <dossier> [--profile <fichier>] [--formats pdf,png] [--overwrite]
# Ce script est dans resources\cli du dossier d'installation de Carto.
# Code de sortie : 0 tout est exporte, 1 au moins un rejet ou une erreur, 2 lot impossible.
$carto = Join-Path $PSScriptRoot '..\..\Carto.exe'
& $carto --batch @args 2>&1 | Out-Host
exit $LASTEXITCODE
