async function run({ options, positional }) {
  return {
    command: 'help',
    status: 'skeleton',
    json: true,
  };
}

module.exports = { run };
