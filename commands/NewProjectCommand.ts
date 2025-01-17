import fetch from 'node-fetch'
import * as unzipper from 'unzipper'
import * as path from 'path'
// @ts-ignore
import { Writer } from 'fstream'
import Listr from 'listr'
import { Stream } from 'stream'
import { Command } from './Command'
import { Inject } from '@Typetron/Container'
import { Storage } from '@Typetron/Storage'
import { projectInstall } from 'pkg-install'

const excludedEntries = ['.github', 'LICENSE.md']

export class NewProjectCommand implements Command {

    @Inject()
    storage: Storage

    async run([projectName]: string[]) {
        const tasks = new Listr([
            {
                title: `Initializing project '${projectName}'`,
                task: () => this.initializeProject(projectName)
            },
            {
                title: 'Installing dependencies (takes a few minutes)',
                task: () => projectInstall({cwd: path.resolve(process.cwd(), projectName)})
            }
        ])

        try {
            await tasks.run()
            console.log('\nProject ready!')
        } catch (error) {
            console.error(error)
        }
    }

    addEnvFile(projectName: string, entry: Stream) {
        const envFileWriter = Writer({path: path.join(projectName, '.env')})
        entry.pipe(envFileWriter)
    }

    async updateProjectFiles(projectName: string) {
        const storage = new Storage()
        let envFile = (await storage.read(path.join(projectName, '.env'))).toString()
        envFile = envFile.replace(/^APP_SECRET.+/, `APP_SECRET = ${String.random(64)}`)
        await storage.put(path.join(projectName, '.env'), envFile)
    }

    async initializeProject(projectName: string) {
        await new Promise<void>(async (resolve) => {
            const url = 'https://github.com/typetron/typetron/archive/master.zip'
            const response = await fetch(url)

            let zipFirstDirectory: string
            response.body
                .pipe(unzipper.Parse())
                .on('entry', entry => {
                    if (!zipFirstDirectory) {
                        zipFirstDirectory = entry.path
                        entry.autodrain()
                        return
                    }

                    if (entry.type == 'Directory') return

                    const fileName = entry.path.replace(`${zipFirstDirectory}`, '')

                    if (excludedEntries.filter(entry => fileName.startsWith(entry)).length) {
                        return
                    }

                    const filePath = path.join(projectName, fileName)
                    const writer = Writer({path: filePath})

                    if (fileName === '.env.example') {
                        this.addEnvFile(projectName, entry)
                    }
                    entry.pipe(writer).on('error', function(error: Error) {console.log('Unzip file error', error)})
                })

            response.body.on('end', resolve)
        })

        await this.updateProjectFiles(projectName)
    }

}

