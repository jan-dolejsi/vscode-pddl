import { expect, use } from 'chai';
import { before, after } from 'mocha';
// eslint-disable-next-line @typescript-eslint/no-var-requires
use(require('chai-string'));

import { exists } from '../../util/workspaceFs';
import { activateExtension } from './testUtils';
import { assertDefined } from '../../utils';
import { workspace, Uri, WorkspaceFolder } from 'vscode';
import { fail } from 'assert';


suite('workspace FS', () => {

    let folderUri: Uri | undefined;
    let fileUri: Uri | undefined;
    let wf: WorkspaceFolder | undefined;
    
    before(async () => {
        await activateExtension();

        wf = assertDefined(workspace.workspaceFolders, "workspace folders")[0];

        // create folder
        folderUri = Uri.joinPath(wf.uri, "existentialTestFolder");
        await workspace.fs.createDirectory(folderUri);

        // create file
        fileUri = Uri.joinPath(wf.uri, "existentialTestFile");
        await workspace.fs.createDirectory(fileUri);
    });

    after(async () => {
        fileUri && await workspace.fs.delete(fileUri, { useTrash: true });
        folderUri && await workspace.fs.delete(folderUri, { useTrash: true, recursive: true });
    });

    test('workspace.fs.createDirectory if it exists', async () => {
        // does not throw, when existing directory is created again
        folderUri && await workspace.fs.createDirectory(folderUri);
    });

    test('workspace.fs.createDirectory nested directory if it exists', async () => {
        if (!folderUri) { fail(); }
        // GIVEN
        const nestedNestedDirUri = Uri.joinPath(folderUri, "nested1", "nested2");

        // WHEN
        await workspace.fs.createDirectory(nestedNestedDirUri);
        const actual = await exists(nestedNestedDirUri);

        // THEN
        expect(actual).true;
    });

    test('existing directory exists', async () => {
        if (!folderUri) { fail(); }
        // GIVEN

        // WHEN
        const folderExists = await exists(folderUri);

        // THEN
        expect(folderExists).to.equal(true);
    });

    test('existing file exists', async () => {
        if (!fileUri) { fail(); }
        // GIVEN

        // WHEN
        const fileExists = await exists(fileUri);

        // THEN
        expect(fileExists).to.equal(true);
    });

    test('non-existent path does not exist', async () => {
        if (!wf) { fail(); }

        // GIVEN
        const nonFolderUri = Uri.joinPath(wf.uri, "nonExistent");

        // WHEN
        const fileExists = await exists(nonFolderUri);

        // THEN
        expect(fileExists).to.equal(false);
    });
});