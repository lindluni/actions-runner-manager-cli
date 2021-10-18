const {Octokit} = require('@octokit/rest');
const {retry} = require('@octokit/plugin-retry');
const {throttling} = require('@octokit/plugin-throttling');
const {createAppAuth} = require('@octokit/auth-app');

const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');

const _Octokit = Octokit.plugin(retry, throttling)

const org = 'department-of-veterans-affairs';

(async function main() {
    await yargs(hideBin(process.argv))
        .command('group-create', 'create a new runner group', (yargs) => {
            yargs
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide --team flag')
                    }
                    return true
                })
        }, async (argv) => {
            const privateKey = await retrievePrivateKey(argv.token)
            console.log(privateKey)
            return
            const client = await newAppClient(privateKey)
            await verifyMaintainerStatus(client, argv)
            await doCreate(argv)
        })
        .command('group-delete', 'delete an existing runner group', (yargs) => {
            yargs
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide --team flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doDelete(argv)
        })
        .command('group-list', 'list runners and repos assigned to a runner group', (yargs) => {
            yargs
                .positional('repos', {
                    type: 'boolean',
                    describe: 'list the repos assigned to the runner group',
                    default: false
                })
                .positional('runners', {
                    type: 'boolean',
                    describe: 'list the runners assigned to the runner group',
                    default: false
                })
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide --team flag')
                    }
                    if (!argv.repos && !argv.runners) {
                        throw new Error('Failed to provide one of, or both of the --repos and --runners flags')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doList(argv)
        })
        .command('repos-add', 'add repositories to a runner group', (yargs) => {
            yargs
                .positional('repos', {
                    type: 'string',
                    describe: 'a comma separted list of repos to add to the runner group: repo1,repo2,repo3,...',
                })
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide the --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide the --team flag')
                    }
                    if (!argv.repos) {
                        throw new Error('Failed to provide the --repos flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doAdd(argv)
        })
        .option('token', {
            alias: 'k',
            type: 'string',
            description: 'GitHub API token',
            global: true
        })
        .option('team', {
            alias: 't',
            type: 'string',
            description: 'GitHub Team',
            global: true
        })
        .command('repos-remove', 'remove repositories from a runner group', (yargs) => {
            yargs
                .positional('repos', {
                    type: 'string',
                    describe: 'a comma separted list of repos to add to the runner group: repo1,repo2,repo3,...',
                })
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide the --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide the --team flag')
                    }
                    if (!argv.repos) {
                        throw new Error('Failed to provide the --repos flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doRemove(argv)
        })
        .command('repos-replace', 'replaces all existing repos with a new set of repos for runner group access', (yargs) => {
            yargs
                .positional('repos', {
                    type: 'string',
                    describe: 'a comma separted list of repos to add to the runner group: repo1,repo2,repo3,...',
                })
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide the --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide the --team flag')
                    }
                    if (!argv.repos) {
                        throw new Error('Failed to provide the --repos flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doReplace(argv)
        })
        .command('token-add', 'create an organization runner addition token', (yargs) => {
            yargs
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide --team flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doTokenAdd()
        })
        .command('token-remove', 'create an organization runner removal token', (yargs) => {
            yargs
                .check((argv) => {
                    if (!argv.token) {
                        throw new Error('Failed to provide --token flag')
                    }
                    if (!argv.team) {
                        throw new Error('Failed to provide --team flag')
                    }
                    return true
                })
        }, async (argv) => {
            await verifyMaintainerStatus(argv)
            await doTokenRemove()
        })
        .wrap(null)
        .demandCommand()
        .scriptName('actions-runner-manager')
        .help()
        .argv
})()

async function doList(argv) {
    const id = await retrieveRunnerGroupID(argv)
    if (argv.repos) {
        const _repos = await client.paginate('GET /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories', {
            org: org,
            runner_group_id: id,
            per_page: 100
        })
        if (_repos.length > 0) {
            console.log(`The following repos have access to the ${argv.team} runner group:`)
            const repos = _repos.map(repo => repo.name)
            for (const repo of repos) {
                console.log(`https://github.com/${org}/${repo}`)
            }
            console.log()
        } else {
            console.log(`No repos found assigned to the ${argv.team} runner group`)
        }
    }
    if (argv.runners) {
        const _runners = await client.paginate('GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners', {
            org: org,
            runner_group_id: id,
            per_page: 100
        })
        if (_runners.length > 0) {
            console.log(`The following runners are assigned to ${argv.team} runner group:`)
            const runners = _runners.map(runner => runner.name)
            for (const runner of runners) {
                console.log(runner)
            }
        } else {
            console.log(`No runners found assigned to the ${argv.team} runner group`)
        }
    }
}

async function doAdd(argv) {
    const id = await retrieveRunnerGroupID(argv)
    const repoNames = argv.repos.split(',')
    const repoIDs = await retrieveRepoIDs(argv)
    for (const name of repoNames) {
        await client.request('PUT /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories/{repository_id}', {
            org: org,
            runner_group_id: id,
            repository_id: repoIDs[name]
        })
    }
}

async function doRemove(argv) {
    const id = await retrieveRunnerGroupID(argv)
    const repoNames = argv.repos.split(',')
    const repoIDs = await retrieveRepoIDs(argv)
    for (const name of repoNames) {
        await client.request('DELETE /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories/{repository_id}', {
            org: org,
            runner_group_id: id,
            repository_id: repoIDs[name]
        })
    }
}

async function doReplace(argv) {
    const id = await retrieveRunnerGroupID(argv)
    const repoNames = argv.repos.split(',')
    const repoIDs = []
    for (const name of repoNames) {
        try {
            const {data: repo} = await client.repos.get({
                owner: org,
                repo: name
            })
            repoIDs.push(repo.id)
        } catch (e) {
            if (e.status === 404) {
                console.error(`Unable to find matching repository for ${name} aborting adding repositories to runner group`)
                process.exit(1)
            }
            throw new Error(e.message)
        }
    }

    await client.request('PUT /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories', {
        org: org,
        runner_group_id: id,
        selected_repository_ids: repoIDs
    })
}

async function doCreate(argv) {
    await client.request('POST /orgs/{org}/actions/runner-groups', {
        org: org,
        name: argv.team,
        visibility: 'selected'
    })
}

async function doDelete(argv) {
    const id = await retrieveRunnerGroupID(argv)
    await client.request('DELETE /orgs/{org}/actions/runner-groups/{runner_group_id}', {
        org: org,
        runner_group_id: id
    })
}

async function doTokenAdd() {
    const {data: token} = await client.request('POST /orgs/{org}/actions/runners/registration-token', {
        org: org
    })
    console.log(token)
}

async function doTokenRemove() {
    const {data: token} = await client.request('POST /orgs/{org}/actions/runners/remove-token', {
        org: org
    })
    console.log(token)
}

async function verifyMaintainerStatus(argv) {
    const userClient = await newUserClient(argv.token)
    const {data: user} = await userClient.users.getAuthenticated({})
    const {data: team} = await userClient.teams.getMembershipForUserInOrg({
        org: org,
        username: user.login,
        team_slug: argv.team
    })
    if (team.role !== 'maintainer') {
        console.error(`Provided API key does not belong to a user with maintainer privileges on the team ${argv.team}`)
        process.exit(1)
    }
}

async function retrieveRunnerGroupID(argv) {
    const runnerGroups = await client.paginate('GET /orgs/{org}/actions/runner-groups', {
        org: org,
        per_page: 100
    })
    let id
    for (const group of runnerGroups) {
        if (group.name.toLowerCase() === argv.team.toLowerCase()) {
            id = group.id
            break
        }
    }
    if (!id) {
        console.error(`Unable to find runner group with name ${argv.team}. Please reach out to GitHub Support if you need help`)
        process.exit(1)
    }
    return id
}

async function retrieveRepoIDs(argv) {
    const userClient = await newUserClient(argv.token)
    const repoNames = argv.repos.split(',')
    const repoIDs = {}
    for (const name of repoNames) {
        try {
            const {data: repo} = await userClient.repos.get({
                owner: org,
                repo: name
            })
            repoIDs[name] = repo.id
        } catch (e) {
            if (e.status === 404) {
                console.error(`Unable to find matching repository for ${name} aborting adding repositories to runner group`)
                process.exit(1)
            }
            throw new Error(e.message)
        }
    }
    return repoIDs
}

async function newAppClient(privateKey) {
    return new _Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: '',
            privateKey: '',
            clientId: '',
            clientSecret: '',
            installationId: 0
        },
        retries: 3,
        throttle: {
            onRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onAbuseLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
            },
        }
    });
}

async function newUserClient(token) {
    return new _Octokit({
        auth: token,
        throttle: {
            onRateLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                if (options.request.retryCount === 0) {
                    octokit.log.info(`Retrying after ${retryAfter} seconds!`);
                    return true;
                }
            },
            onAbuseLimit: (retryAfter, options, octokit) => {
                octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
            },
        }
    });
}

async function retrievePrivateKey(token) {
    const client = await newUserClient(token)
    const {data: secret} = await client.request('GET /repos/{owner}/{repo}/actions/secrets/{secret_name}', {
        owner: org,
        repo: 'github-vault',
        secret_name: 'ACTIONS_RUNNER_MANAGER_PRIVATE_KEY'
    })
    return secret
}
