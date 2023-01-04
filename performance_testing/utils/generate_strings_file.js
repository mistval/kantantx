const stringCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomString(length) {
  return Array(length).fill().map(
    () => stringCharacters[Math.floor(Math.random() * stringCharacters.length)],
  ).join('');
}

async function main() {
  const argumentKvps = process.argv.slice(2).map(a => a.split('='));

  const args = {
    numstrings: 1000,
    stringlength: 30,
    keylength: 15,
    numadditionalmeta: 0,
    additionalmetakeylength: 15,
    additionalmetavaluelength: 30,
  };

  for (const [key, value] of argumentKvps) {
    if (args[key] === undefined) {
      throw new Error(`Unknown argument ${key}`);
    }

    args[key] = Number(value);
  }

  const stringFileContent = Object.fromEntries(
    Array(args.numstrings).fill().map(() => [
      generateRandomString(args.keylength),
      args.numadditionalmeta === 0
        ? generateRandomString(args.stringlength)
        : Object.fromEntries([
          ['string', generateRandomString(args.stringlength)],
          ...Array(args.numadditionalmeta).fill().map(() => [
            generateRandomString(args.additionalmetakeylength),
            generateRandomString(args.additionalmetavaluelength),
          ]),
        ]),
    ]),
  );

  console.log(JSON.stringify(stringFileContent, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
