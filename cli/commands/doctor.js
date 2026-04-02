async function run({ options, positional }) {
  return {
    command: 'doctor',
    status: 'skeleton',
    json: true,
    provider: options.provider || null,
  };
}

module.exports = { run };
