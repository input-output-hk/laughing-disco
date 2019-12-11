// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

class Item extends vscode.TreeItem {
	constructor(o: { id: Number, time: number, loc: string, line: Number, col: Number}) {
		if(o.line === -1 && o.col === -1) {
			super(o.loc, vscode.TreeItemCollapsibleState.Collapsed);
			this.id = `${o.id}`;
			this.description = (o.time * 100.0).toFixed(4) + "%";
		} else {
			super(`${path.basename(o.loc)}:${o.line}:${o.col}`, vscode.TreeItemCollapsibleState.Collapsed);
			this.id = `${o.id}`;
			this.description = (o.time * 100.0).toFixed(4) + "%";
			this.command = { command: 'extension.openFile', arguments: [`${o.loc}:${o.line}:${o.col}`], title: "Open Location" };
		}
	}
}

export class DepNodeProvider implements vscode.TreeDataProvider<Item> {

	private sqlite3(query: string): string {
		console.log(query);
		return "sqlite3 " + this.workspacePath + "/prof.db '" + query + "'";
	}

	private workspacePath: string;
	private limit: Number = 5;

	getTreeItem(element: Item): vscode.TreeItem {
		return element;
	}
	 //| Thenable<TreeItem>;
	getChildren(element?: Item): vscode.ProviderResult<Item[]> {
		const parent = element === undefined ? -1 : Number(element.id);
		return new Promise<Item[]>((resolve, reject) => {
			cp.exec(this.sqlite3(`select id, printf("%.6f",time/(select sum(time)*1.0 from prof where parent == -1)) as pct, name as location from prof where parent == ${parent} order by time desc limit ${this.limit};`), (err, stdout, _stderr) => {
				// vscode.window.showInformationMessage("processing profiling data...");
				const result = stdout.split('\n').filter((x) => x !== "").map((row) => {
					const elems = row.split('|');
					const loc = elems[2].split(":");
					if(loc.length < 3) {
						return  { id: Number(elems[0]), time: Number(elems[1]), loc: loc[0], line: -1, col: -1};
					} else {
						return { id: Number(elems[0]), time: Number(elems[1]), loc: loc[0], line: Number(loc[1]), col: Number(loc[2]) };
					}
				});
				resolve(result.map(r => new Item(r)));
			});
		// 	// select id, printf("%.6f",time/(select sum(time)*1.0 from prof where parent == -1)) as pct, name as location from prof where parent == 749026 order by time desc limit 5;
		// const file = "/nix/store/75y8imsw20c1r0y1hb4l45qpk3szrpw3-nixpkgs/lib/modules.nix:98:6";
		// const a = new Item(path.basename(file), vscode.TreeItemCollapsibleState.Collapsed);
		// a.description = "foo";
		// a.command = { command: 'extension.openFile', arguments: [file], title: "Open Location" };
		// resolve([a, new Item("b")]);
	});
	}

	constructor(root: string) {
		this.workspacePath = root;
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	vscode.commands.registerCommand('extension.openFile', (resource) => {
		const file = resource.split(":");
		vscode.window.showTextDocument(vscode.Uri.file(file[0])).then(e => {
			e.selection = new vscode.Selection(Number(file[1])-1, Number(file[2])-1,Number(file[1])-1, Number(file[2])-1);
			e.revealRange(new vscode.Range(Number(file[1])-1, Number(file[2])-1,Number(file[1])-1, Number(file[2])-1),vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		});
	});

	if(vscode.workspace.workspaceFolders === undefined ||
	   vscode.workspace.workspaceFolders.length !== 1) {
		return vscode.window.showErrorMessage("Nix profile plugins works only on single workspace setups.");
	}

	const nodeDependenciesProvider = new DepNodeProvider(vscode.workspace.workspaceFolders[0].uri.fsPath);//vscode.workspace.rootPath);
	vscode.window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "nix-profile" is now active!');

	let lastWorkspacePath: string;

	let collection = vscode.languages.createDiagnosticCollection('nix');
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		if (vscode.window.activeTextEditor === undefined) { return; }
		const document = vscode.window.activeTextEditor.document;

		const workspace = vscode.workspace.getWorkspaceFolder(document.uri);

		let workspacePath = lastWorkspacePath;
		if (workspace !== undefined) {
			workspacePath = workspace.uri.fsPath;
			console.log("workspace path = " + workspacePath);
			lastWorkspacePath = workspacePath;
		}
		if (workspacePath === undefined) {
			return vscode.window.showWarningMessage("No workspace found!");
		}

		vscode.window.showInformationMessage('File is: ' + document.uri.fsPath);
		// vscode.window.showInformationMessage('Workspace is: ' + workspace.uri.fsPath);

		function sqlite3(query: string): string {
			console.log(query);
			return "sqlite3 " + workspacePath + "/prof.db '" + query + "'";
		}

		cp.exec(sqlite3("SELECT sum(time) FROM prof WHERE parent == -1"), (err, stdout, _stderr) => {
			const total = Number(stdout);
			vscode.window.showInformationMessage("total profile is " + total/1000000 +"ms");
			if (err) {
				vscode.window.showWarningMessage('error: ' + err);
			}
			vscode.window.showInformationMessage("gathering profiling data...");
			cp.exec(sqlite3("SELECT id, count(*), printf(\"%.6f\",sum(time)/(select sum(time)*1.0 from prof where parent == -1)), name from prof where name like \"" + document.uri.fsPath + "%\" group by name"), (err, stdout, _stderr) => {
				vscode.window.showInformationMessage("processing profiling data...");
				const result = stdout.split('\n').filter((x) => x !== "").map((row) => {
					const elems = row.split('|');
					const loc = elems[3].split(":");
					return { id: Number(elems[0]), count: Number(elems[1]), time: Number(elems[2]), line: loc[0], row: Number(loc[1]), col: Number(loc[2]) };
				});
				const diagnostics = result.map((info) => {
					const diag = new vscode.Diagnostic(
						new vscode.Range(info.row-1, info.col-1, info.row-1, info.col),
						(info.time * 100).toFixed(4) + "% (" + info.count + "x)",
						vscode.DiagnosticSeverity.Information);
					// diag.relatedInformation = cp
					// 	.execSync(sqlite3("SELECT printf(\"%.6f\",sum(time)/(select sum(time)*1.0 from prof where parent == -1)), name FROM prof WHERE parent == " + info.id + " AND name != \"undefined position\""))
					// 	.toLocaleString()
					// 	.split("\n")
					// 	.filter((x) => x !== "")
					// 	.map((line) => {
					// 		const record = line.split("|");
					// 		const loc = record[1].split(":");
					// 		return new vscode.DiagnosticRelatedInformation(new vscode.Location(vscode.Uri.file(loc[0]),new vscode.Position(Number(loc[1]),Number(loc[2]))), (Number(record[0])*100).toFixed(4) + "%");
					// 	});
					return diag;
				});
				console.log(`Setting ${diagnostics.length} diagnostics on ${document.uri.fsPath}`);
				collection.set(document.uri,diagnostics);
				if (err) {
					vscode.window.showWarningMessage('error: ' + err);
				}
				vscode.window.showInformationMessage("done");
			});
		});
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
