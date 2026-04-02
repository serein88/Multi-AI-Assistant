async function run({ options, positional }) {
  return {
    command: 'ask',
    status: 'skeleton',
    json: true,
    provider: options.provider || null,
    prompt: options.prompt || null,
  };
}

module.exports = { run };
