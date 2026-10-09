import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { LanguageServerAdapter } from './LanguageServerAdapter.js';

const connection = createConnection(ProposedFeatures.all);
const adapter = new LanguageServerAdapter(connection);
adapter.start();
connection.onShutdown(() => adapter.dispose());
connection.onExit(() => { adapter.dispose(); process.exit(0); });
connection.listen();
