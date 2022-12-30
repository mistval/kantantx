import fs from 'fs';
import type yargs from "yargs"
import { APIRequest } from "../api_request";
import { apiKey, host } from "../common_options";
import * as kantanTxFormatter from '../source_file_loader/format_handlers/kantantx';

interface IOptions {
  apikey: string;
  host: string;
  files: string[];
  format: string;
  customFormatter?: string;
  force: boolean;
}

interface IFormatHandler {
  parse: (file: string) => Array<{
    key: string;
    value: string;
    additionalFields: Array<{ fieldName: string; value: string; uiHidden: boolean }>;
  }>;

  serialize: (strings: Array<{ key: string; value: string; }>) => string;
}

export default {
  command: 'login',
  desc: 'Upload source files. This command should be run in the root directory of your project.',
  builder: function (yargs: yargs.Argv<{}>) {
    return yargs
      .option('files', {
        alias: 'f',
        describe: 'Relative paths to the files to upload.',
        demandOption: true,
        array: true,
        type: 'string'
      })
      .option('format', {
        describe: 'The format to use for the uploaded files.',
        demandOption: true,
        type: 'string',
        choices: ['kantantx', 'custom'],
      })
      .option('custom-formatter', {
        describe: 'The format to use for the uploaded files.',
        demandOption: true,
        type: 'string',
        choices: ['kantantx', 'custom'],
      })
      .option('force', {
        describe: 'Ignore any warnings and continue with the upload.',
        demandOption: false,
        type: 'boolean',
        default: false,
      })
      .option(...host)
      .option(...apiKey);
  },
  handler: async function (argv: IOptions) {
    const requester = new APIRequest(argv.host, argv.apikey);
    let formatter = kantanTxFormatter as IFormatHandler;

    const existingDocumentsResponse = await requester.doGetRequest<Array<{ name: string; }>>(`/documents`);
    if (!existingDocumentsResponse.success) {
      throw Error(`Failed to get existing documents: ${existingDocumentsResponse.status} ${JSON.stringify(existingDocumentsResponse.responseBody)}`);
    }

    const existingDocumentsNotPartOfPush = existingDocumentsResponse.responseBody.filter(doc => !argv.files.includes(doc.name));
    if (existingDocumentsNotPartOfPush.length > 0 && !argv.force) {
      const message = `The server is aware of some source files that were not included in the --files for this upload:
${existingDocumentsNotPartOfPush.map(doc => doc.name).join('\n')}
This might indicate that you're not running this command in the root directory of your project (a mistake), or that you have moved or deleted source files.
If you moved files, you should use the 'kantantx mv' command to inform the server of the move.
If you deleted files, you should use the 'kantantx rm' command to inform the server of the deletion (this is a pretty destructive operations, and will permanently delete all translations and history for that file).
Then try to upload again.

To continue with the upload as-is, use the --force option.
`;

      throw Error(message);
    }


    if (argv.format === 'custom') {
      if (!argv.customFormatter) {
        throw Error(`If using 'custom' format, you must provide a path to a custom formatter with the --custom-formatter option.`);
      }

      formatter = require(argv.customFormatter);
    }

    for (const file of argv.files) {
      const content = fs.readFileSync(file, 'utf8');
      const parsedContent = formatter.parse(content);
      await requester.doPutRequest(`/documents/${encodeURIComponent(file)}`, parsedContent);
    }
  }
};
