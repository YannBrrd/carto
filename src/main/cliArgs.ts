/**
 * Command line of the batch export. Without --batch the application starts as usual;
 * switches the command line does not know (Chromium ones) are left to Electron.
 */

export const CLI_FORMATS = ['pdf', 'png', 'jpeg', 'svg'] as const;
export type CliFormat = typeof CLI_FORMATS[number];

export type CliCommand =
  | { mode: 'gui' }
  | { mode: 'help' }
  | { mode: 'error'; message: string }
  | { mode: 'batch'; input: string; output: string; profile?: string; formats?: CliFormat[]; overwrite: boolean };

export const CLI_USAGE = `Carto - export par lot de territoires KML

Usage :
  carto --batch --input <dossier> --output <dossier> [options]

  -i, --input <dossier>    dossier des fichiers KML (sous-dossiers compris)
  -o, --output <dossier>   dossier de sortie (même arborescence)
  -p, --profile <fichier>  profil JSON enregistré depuis l'application
                           (défaut : le dernier profil de l'application)
  -f, --formats <liste>    formats séparés par des virgules : pdf, png, jpeg, svg
                           (défaut : ceux du profil)
      --overwrite          réexporte les territoires déjà exportés
  -h, --help               cette aide

Un rapport rapport.csv est écrit dans le dossier de sortie.
Code de sortie : 0 tout est exporté, 1 au moins un rejet ou une erreur, 2 lot impossible.
Linux sans écran : xvfb-run carto --batch ...`;

const VALUE_OPTIONS: Record<string, 'input' | 'output' | 'profile' | 'formats'> = {
  '--input': 'input', '-i': 'input',
  '--output': 'output', '-o': 'output',
  '--profile': 'profile', '-p': 'profile',
  '--formats': 'formats', '-f': 'formats',
};

/** Command of the process arguments (process.argv: the executable first) */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const args = argv.slice(1);
  if (args.includes('--help') || args.includes('-h')) return { mode: 'help' };
  if (!args.includes('--batch')) return { mode: 'gui' };

  const values: Partial<Record<'input' | 'output' | 'profile' | 'formats', string>> = {};
  let overwrite = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    const [name, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const key = VALUE_OPTIONS[name];
    if (!key) continue;
    const value = inline ?? args[i + 1];
    if (value === undefined || (inline === undefined && value.startsWith('-'))) {
      return { mode: 'error', message: `Valeur manquante pour ${name}.` };
    }
    values[key] = value;
    if (inline === undefined) i++;
  }

  if (!values.input) return { mode: 'error', message: 'Dossier des KML manquant : --input <dossier>.' };
  if (!values.output) return { mode: 'error', message: 'Dossier de sortie manquant : --output <dossier>.' };

  const command: CliCommand = { mode: 'batch', input: values.input, output: values.output, overwrite };
  if (values.profile) command.profile = values.profile;
  if (values.formats !== undefined) {
    const formats = [...new Set(values.formats.split(',').map(format => format.trim().toLowerCase()).filter(Boolean))];
    if (formats.length === 0) return { mode: 'error', message: 'Aucun format : --formats pdf,png,jpeg,svg.' };
    const unknown = formats.find(format => !(CLI_FORMATS as readonly string[]).includes(format));
    if (unknown) return { mode: 'error', message: `Format inconnu : ${unknown} (pdf, png, jpeg, svg).` };
    command.formats = formats as CliFormat[];
  }
  return command;
}
