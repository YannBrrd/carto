@echo off
rem Carto - export par lot en ligne de commande (Windows, invite de commandes)
rem   carto-cli --input <dossier> --output <dossier> [--profile <fichier>] [--formats pdf,png] [--overwrite]
rem Ce script est dans resources\cli du dossier d'installation de Carto.
rem La sortie passe par un tube pour s'afficher ; le code de sortie est celui de carto-cli.ps1.
"%~dp0..\..\Carto.exe" --batch %* 2>&1 | findstr "^"
