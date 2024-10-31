const semver = require('semver');
const config = require('./config');
const globals = require('./globals');
const fetch = require('node-fetch');
const path = require('path');
const fss = require('fs');

class Package {
    constructor({ language, version, download, checksum }) {
        this.language = language;
        this.version = semver.parse(version);
        this.checksum = checksum;
        this.download = download;
    }

    get installed() {
        return fss.exists_sync(
            path.join(this.install_path, globals.pkg_installed_file)
        );
    }

    get install_path() {
        return path.join(
            config.data_directory,
            globals.data_directories.packages,
            this.language,
            this.version.raw
        );
    }

    static async get_package_list() {
        const repo_content = await fetch(config.repo_url).then(x => x.text());

        const entries = repo_content.split('\n').filter(x => x.length > 0);

        return entries.map(line => {
            const [language, version, checksum, download] = line.split(',', 4);

            return new Package({
                language,
                version,
                checksum,
                download,
            });
        });
    }

    static async get_package(lang, version) {
        const packages = await Package.get_package_list();

        const candidates = packages.filter(pkg => {
            return (
                pkg.language == lang && semver.satisfies(pkg.version, version)
            );
        });

        candidates.sort((a, b) => semver.rcompare(a.version, b.version));

        return candidates[0] || null;
    }
}

module.exports = Package;
