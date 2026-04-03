const fs = require('fs');
const path = require('path');
const contracts = require('../runtime/contracts');
const providerRegistry = require('../providers/registry');

const HELP_DIR = path.join(__dirname, '..', 'help');

const COMMAND_TOPICS = ['ask', 'providers', 'doctor', 'help'];

function scanHelpInventory() {
  const inventory = {
    commands: [],
    semantic: [],
    providers: [],
  };
  
  let files;
  try {
    files = fs.readdirSync(HELP_DIR);
  } catch {
    return inventory;
  }
  
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    
    const baseName = file.slice(0, -3);
    
    if (baseName.startsWith('provider-')) {
      const providerId = baseName.slice(9);
      inventory.providers.push(providerId);
    } else if (COMMAND_TOPICS.includes(baseName)) {
      inventory.commands.push(baseName);
    } else {
      inventory.semantic.push(baseName);
    }
  }
  
  return inventory;
}

function loadHelpFile(filename) {
  const filePath = path.join(HELP_DIR, filename);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { found: true, content, error: null };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { found: false, content: null, error: null };
    }
    return { found: false, content: null, error: err };
  }
}

function getProviderIds() {
  return providerRegistry.getProviderIds();
}

function isKnownProvider(providerId) {
  return providerRegistry.getProviderById(providerId) !== null;
}

function isKnownCommandTopic(topic) {
  return COMMAND_TOPICS.includes(topic);
}

function getSemanticTopics() {
  const inventory = scanHelpInventory();
  return inventory.semantic.sort();
}

function isKnownSemanticTopic(topic) {
  const semanticTopics = getSemanticTopics();
  return semanticTopics.includes(topic);
}

function getAvailableTopics() {
  const providerIds = getProviderIds();
  const semanticTopics = getSemanticTopics();
  return [
    `Commands: ${COMMAND_TOPICS.join(', ')}`,
    `Semantic topics: ${semanticTopics.length > 0 ? semanticTopics.join(', ') : '(none)'}`,
    `Provider help: provider <id> (${providerIds.join(', ')})`,
  ].join('\n');
}

async function run({ options, positional }) {
  const topic = positional[0];
  
  if (!topic) {
    const providerIds = getProviderIds();
    const semanticTopics = getSemanticTopics();
    const helpText = `multi-ai help - Show help for commands and topics

USAGE:
  multi-ai help [topic]
  multi-ai help provider <id>

AVAILABLE TOPICS:
${getAvailableTopics()}

EXAMPLES:
  multi-ai help ask
  multi-ai help providers
  multi-ai help doctor${semanticTopics.length > 0 ? `\n  multi-ai help ${semanticTopics[0]}` : ''}
  multi-ai help provider ${providerIds[0] || '<id>'}
`;
    return contracts.makeResponse('help', 'success', { helpText });
  }
  
  if (topic === 'provider') {
    const providerId = positional[1];
    
    if (!providerId) {
      return contracts.makeErrorResponse('help', 'MISSING_PROVIDER_ID',
        'Provider ID is required',
        'Usage: multi-ai help provider <id>. Available providers: ' + getProviderIds().join(', '));
    }
    
    if (!isKnownProvider(providerId)) {
      return contracts.makeErrorResponse('help', 'UNKNOWN_PROVIDER',
        `Unknown provider: ${providerId}`,
        'Available providers: ' + getProviderIds().join(', '));
    }
    
    const result = loadHelpFile(`provider-${providerId}.md`);
    
    if (!result.found) {
      if (result.error) {
        return contracts.makeErrorResponse('help', 'HELP_FILE_READ_ERROR',
          `Failed to read help file for provider: ${providerId}`,
          `File system error: ${result.error.message}`);
      }
      return contracts.makeErrorResponse('help', 'HELP_FILE_NOT_FOUND',
        `Help file not found for provider: ${providerId}`,
        'The provider is known but its help file is missing. This may be a bug.');
    }
    
    return contracts.makeResponse('help', 'success', { helpText: result.content });
  }
  
  if (isKnownCommandTopic(topic)) {
    const result = loadHelpFile(`${topic}.md`);
    
    if (!result.found) {
      if (result.error) {
        return contracts.makeErrorResponse('help', 'HELP_FILE_READ_ERROR',
          `Failed to read help file for command: ${topic}`,
          `File system error: ${result.error.message}`);
      }
      return contracts.makeErrorResponse('help', 'HELP_FILE_NOT_FOUND',
        `Help file not found for command: ${topic}`,
        'The command is known but its help file is missing. This may be a bug.');
    }
    
    return contracts.makeResponse('help', 'success', { helpText: result.content });
  }
  
  const semanticTopics = getSemanticTopics();
  if (semanticTopics.includes(topic)) {
    const result = loadHelpFile(`${topic}.md`);
    
    if (!result.found) {
      if (result.error) {
        return contracts.makeErrorResponse('help', 'HELP_FILE_READ_ERROR',
          `Failed to read help file for topic: ${topic}`,
          `File system error: ${result.error.message}`);
      }
      return contracts.makeErrorResponse('help', 'HELP_FILE_NOT_FOUND',
        `Help file not found for topic: ${topic}`,
        'The topic is known but its help file is missing. This may be a bug.');
    }
    
    return contracts.makeResponse('help', 'success', { helpText: result.content });
  }
  
  return contracts.makeErrorResponse('help', 'UNKNOWN_TOPIC',
    `Unknown help topic: ${topic}`,
    `Available topics:\n${getAvailableTopics()}`);
}

module.exports = { 
  run,
  getProviderIds,
  isKnownProvider,
  isKnownCommandTopic,
  isKnownSemanticTopic,
  getSemanticTopics,
  getAvailableTopics,
  scanHelpInventory,
  loadHelpFile,
};
