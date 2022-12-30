import type yargs from "yargs"
import { APIRequest } from "../api_request";
import { apiKey, host } from "../common_options";
import { writeToDotEnv } from "../dotenv";

interface IOptions {
  apikey: string;
  host: string;
  files: string[];
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
      .option(...host)
      .option(...apiKey);
  },
  handler: async function (argv: IOptions) {
    const requester = new APIRequest(argv.host);
    const result = await requester.doPutRequest<{ apiKey: string }>('/login', {
      username: argv.username,
      password: argv.password,
    });

    if (result.success) {
      const { apiKey } = result.responseBody;
      writeToDotEnv('APIKEY', apiKey);
      writeToDotEnv('HOST', argv.host)
      console.log('Login successful, credentials written to .env file');
    } else {
      console.error('Operation failed');
      console.error(JSON.stringify(result.responseBody));
      process.exitCode = 1;
    }
  }
};
