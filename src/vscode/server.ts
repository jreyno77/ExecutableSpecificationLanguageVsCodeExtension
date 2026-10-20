import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from './LanguageServerAdapter.js';
import { FileSources } from './FileSources.js';

const connection = createConnection(ProposedFeatures.all);
const sources = new FileSources();
const adapter = new LanguageServerAdapter(connection, sources, sources);
adapter.start();
connection.onShutdown(() => adapter.dispose());
connection.onExit(() => { adapter.dispose(); process.exit(0); });
connection.listen();
