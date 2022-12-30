#!/usr/bin/env node

import 'dotenv/config';
import yargs from 'yargs';
import loginCommand from './commands/login';
import createUserCommand from './commands/createuser';
import uploadSourceCommand from './commands/uploadsource';

yargs
  .scriptName("kantantx")
  .commandDir('./commands')
  .command(loginCommand)
  .command(createUserCommand)
  .command(uploadSourceCommand)
  .demandCommand()
  .env('KANTANTX')
  .help()
  .argv
