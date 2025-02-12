const express = require('express');
const router = express.Router();

const runtime = require('../runtime');
const { Job } = require('../job');
const package = require('../package');
const logger = require('logplease').create('api/playground');

function get_job(body) {
    let {
        language,
        version,
        files,
    } = body;

    return new Promise((resolve, reject) => {
        if (!language || typeof language !== 'string') {
            return reject({
                message: 'language is required as a string',
            });
        }
        if (!version || typeof version !== 'string') {
            return reject({
                message: 'version is required as a string',
            });
        }
        if (!files || !Array.isArray(files)) {
            return reject({
                message: 'files is required as an array',
            });
        }
        for (const [i, file] of files.entries()) {
            if (typeof file.content !== 'string') {
                return reject({
                    message: `files[${i}].content is required as a string`,
                });
            }
        }

        const rt = runtime.get_latest_runtime_matching_language_version(
            language,
            version
        );
        if (rt === undefined) {
            return reject({
                message: `${language}-${version} runtime is unknown`,
            });
        }

        if (
            rt.language !== 'file' &&
            !files.some(file => !file.encoding || file.encoding === 'utf8')
        ) {
            return reject({
                message: 'files must include at least one utf8 encoded file',
            });
        }

        resolve(
            new Job({
                runtime: rt,
                args: [],
                stdin: '',
                files,
                timeouts: {
                    run: rt.timeouts.run,
                    compile: rt.timeouts.compile,
                },
                cpu_times: {
                    run: rt.cpu_times.run,
                    compile: rt.cpu_times.compile,
                },
                memory_limits: {
                    run: rt.memory_limits.run,
                    compile: rt.memory_limits.compile,
                },
            })
        );
    });
}

router.get('/health', async (req, res, next) => {
    return res.status(200).send({ currentTime: `${new Date()}` });
});

router.post('/execute', async (req, res) => {
    let job;
    try {
        job = await get_job(req.body);
    } catch (error) {
        return res.status(400).json(error);
    }
    try {
        const box = await job.prime();

        let result = await job.execute(box);
        // Backward compatibility when the run stage is not started
        if (result.run === undefined) {
            result.run = result.compile;
        }

        return res.status(200).send(result);
    } catch (error) {
        logger.error(`Error executing job: ${job.uuid}:\n${error}`);
        return res.status(500).send();
    } finally {
        try {
            await job.cleanup(); // This gets executed before the returns in try/catch
        } catch (error) {
            logger.error(`Error cleaning up job: ${job.uuid}:\n${error}`);
            return res.status(500).send(); // On error, this replaces the return in the outer try-catch
        }
    }
});

router.get('/version', async (req, res, next) => {
    const { version } = require('../../package.json');
    return res.status(200).send({ version: `Playground v${version}` });
});

router.get('/runtimes', (req, res) => {
    const runtimes = runtime.map(rt => {
        return {
            language: rt.language,
            version: rt.version.raw,
            aliases: rt.aliases,
            runtime: rt.runtime,
        };
    });

    return res.status(200).send(runtimes);
});

router.get('/packages', async (req, res) => {
    logger.debug('Request to list packages');
    let packages = await package.get_package_list();

    packages = packages.map(pkg => {
        return {
            language: pkg.language,
            language_version: pkg.version.raw,
            installed: pkg.installed,
        };
    });

    return res.status(200).send(packages);
});

module.exports = router;
