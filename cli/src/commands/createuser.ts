import type yargs from "yargs"
import { APIRequest } from "../api_request";
import { apiKey, host } from "../common_options";

interface IOptions {
  username: string;
  password: string;
  role: string;
  host: string;
  apikey: string;
  languagecodes: string[];
}

export default {
  command: 'createuser',
  desc: 'Create a new user',
  builder: function (yargs: yargs.Argv<{}>) {
    return yargs
      .option('username', {
        alias: 'u',
        describe: 'New user username',
        demandOption: true,
        type: 'string'
      })
      .option('password', {
        alias: 'p',
        describe: 'New user password',
        demandOption: true,
        type: 'string'
      })
      .option('role', {
        alias: 'r',
        describe: 'New user role',
        demandOption: true,
        choices: ['admin', 'translator'],
        type: 'string'
      })
      .option('languagecodes', {
        alias: 'l',
        describe: 'The language codes the user can translate (not required for admin users)',
        type: 'string',
        array: true,
        default: [],
      })
      .option(...host)
      .option(...apiKey);
  },
  handler: async function (argv: IOptions) {
    const requester = new APIRequest(argv.host, argv.apikey);
    const result = await requester.doPostRequest<{ apiKey: string }>('/users', {
      username: argv.username,
      password: argv.password,
      role: argv.role.toUpperCase(),
      languageCodes: argv.languagecodes,
    });

    if (result.success) {
      const { apiKey } = result.responseBody;
      console.log('User created successfully');
      console.log('New user API key:', apiKey);
    } else {
      console.error('Operation failed');
      console.error(JSON.stringify(result.responseBody));
      process.exitCode = 1;
    }
  }
};
