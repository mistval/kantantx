import type yargs from "yargs"
import { APIRequest } from "../api_request";
import { host } from "../common_options";
import { writeToDotEnv } from "../dotenv";

interface IOptions {
  username: string;
  password: string;
  host: string;
}

export default {
  command: 'login',
  desc: 'Log in to KantanTX and save your credentials to a .env file',
  builder: function (yargs: yargs.Argv<{}>) {
    return yargs
      .option('username', {
        alias: 'u',
        describe: 'KantanTX username',
        demandOption: true,
        type: 'string'
      })
      .option('password', {
        alias: 'p',
        describe: 'KantanTX password',
        demandOption: true,
        type: 'string'
      })
      .option(...host);
  },
  handler: async function (argv: IOptions) {
    const requester = new APIRequest(argv.host);
    const result = await requester.doPostRequest<{ apiKey: string }>('/login', {
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
