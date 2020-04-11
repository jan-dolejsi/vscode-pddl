import * as path from 'path';

import { runTests } from 'vscode-test';
import { URI } from 'vscode-uri';

async function main(): Promise<void> {
	try {
		const vsCodeTestArgs = new Map<string, string>();
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');
		vsCodeTestArgs.set('--extensionDevelopmentPath', extensionDevelopmentPath);

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
		vsCodeTestArgs.set('--extensionTestsPath', extensionTestsPath);

		// The path to the workspace, where the files will be created
		const testWorkspace = "--folder-uri=" + URI.file(path.resolve(extensionDevelopmentPath, 'src/test/tmpFolder'));
		const launchArgs = [testWorkspace, "--disable-extensions"];
		vsCodeTestArgs.set('launchArgs', launchArgs.join(' '));

		console.log(`vscode-test arguments: `);
		console.dir(vsCodeTestArgs);

		// Download VS Code 1.40, unzip it and run the integration test
		await runTests({
			version: '1.40.1',
			extensionDevelopmentPath, extensionTestsPath,
			launchArgs: launchArgs
		});

		// Download VS Code 1.41, unzip it and run the integration test
		await runTests({
			version: '1.41.1',
			extensionDevelopmentPath, extensionTestsPath,
			launchArgs: launchArgs
		});

		// Download the latest VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath, extensionTestsPath,
			launchArgs: launchArgs
		});
		
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
