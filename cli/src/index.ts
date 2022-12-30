#!/usr/bin/env node

import 'dotenv/config';
import yargs from 'yargs';
import loginCommand from './commands/login';
import createUserCommand from './commands/createuser';

yargs
  .scriptName("kantantx")
  .commandDir('./commands')
  .command(loginCommand)
  .command(createUserCommand)
  .demandCommand()
  .env('KANTANTX')
  .strict()
  .help()
  .argv
