import fs from 'fs';
import assert from 'assert';
import type yargs from "yargs"
import { APIRequest } from "../api_request";
import { apiKey, host } from "../common_options";
import * as kantanTxFormatter from '../source_file_loader/format_handlers/kantantx';

interface IOptions {
  apikey: string;
  host: string;
  files: string[];
  format: string;
  customFormatter?: string | undefined;
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
  command: 'downloadtranslations',
  desc: 'Download translation files. This command should be run in the root directory of your project.',
  builder: function (yargs: yargs.Argv<{}>) {
    return yargs
      .option('files', {
        alias: 'f',
        describe: 'Relative paths to the source files to download translations for.',
        demandOption: true,
        array: true,
        type: 'string'
      })
      .option('format', {
        describe: 'The format to use for the downloaded files files.',
        demandOption: true,
        type: 'string',
        choices: ['kantantx', 'custom'],
      })
      .option('custom-formatter', {
        describe: 'A path to a custom formatter module file.',
        demandOption: false,
        type: 'string',
      })
      .option(...host)
      .option(...apiKey);
  },
  handler: async function (argv: IOptions) {
    const requester = new APIRequest(argv.host, argv.apikey);
    let formatter = kantanTxFormatter as IFormatHandler;

    const existingDocumentsResponse = await requester.doGetRequest<Array<{ name: string; languageCodes: string[] }>>(`/documents`);
    if (!existingDocumentsResponse.success) {
      throw Error(`Failed to get existing documents: ${existingDocumentsResponse.status} ${JSON.stringify(existingDocumentsResponse.responseBody)}`);
    }

    const unknownDocuments = argv.files.filter(f => !existingDocumentsResponse.responseBody.some(d => d.name === f));
    for (const unknownDocument of unknownDocuments) {
      console.warn(`Warning: Document '${unknownDocument}' does not exist in the project. Skipping.`);
    }

    if (argv.format === 'custom') {
      if (!argv.customFormatter) {
        throw Error(`If using 'custom' format, you must provide a path to a custom formatter with the --custom-formatter option.`);
      }

      formatter = require(argv.customFormatter);
    }

    for (const file of argv.files) {
      const fileExtension = file.match(/\.([^\.]+)$/)?.[1];
      console.log(fileExtension);
      const matchingDocument = existingDocumentsResponse.responseBody.find(d => d.name === file);
      assert(matchingDocument);

      for (const languageCode of matchingDocument.languageCodes) {
        const requestPath = `/documents/${encodeURIComponent(file)}/strings?languageCode=${encodeURIComponent(languageCode)}`;
        const translationResponse = await requester.doGetRequest<Array<{ key: string; value: string; }>>(requestPath);
        if (!translationResponse.success) {
          throw Error(`Failed to get translations for document '${file}' and language code '${languageCode}': ${translationResponse.status} ${JSON.stringify(translationResponse.responseBody)}`);
        }

        const translationFileContent = formatter.serialize(translationResponse.responseBody);
        const outputFilePath = file.replace(`.${fileExtension}`, `.${languageCode}.${fileExtension}`);
        fs.writeFileSync(outputFilePath, translationFileContent);
        console.log(`Downloaded ${outputFilePath}`);
      }
    }
  }
};
