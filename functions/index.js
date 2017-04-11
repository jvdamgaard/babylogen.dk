const execSync = require('child_process').execSync;
const fs = require('fs');
const path = require('path');
const request = require('request');
const tar = require('tar');
const zlib = require('zlib');
const ghpages = require('gh-pages');

// CONFIGURATION
const GITHUB_USERNAME = 'jvdamgaard';
const REPO_NAME = 'babylogen.dk';
const BUILD_DIR = './www'; // the build will be executed in this directory, which is relative to the repo root
const BUILD_CMD = 'npm run generate'; // the command to execute the build
const OUTPUT_DIR = './dist'; // the output directory that should be gzipped, relative to the repo root

// githubClone clones a repo (GITHUB_USERNAME/REPO_NAME) from Github
// most node Git clients don't work on Cloud Functions due to git dependencies, so do it manually :(
function githubClone(clonePath, callback) {
  let url = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/tarball/master`;
  let options = {
    url,
    headers: {
      'User-Agent': 'buildserverless' // Github API requires a User-Agent
    }
  }
  request(options)
    .on('response', res => {
      if (res.statusCode !== 200) {
        throw new Error('Status not 200');
      }

      res
        .pipe(zlib.createGunzip()) // un-gzip
        .pipe(tar.Extract({ path: clonePath, strip: 1 })) // extract tarball
        .on('finish', callback);
    })
    .on('error', err => {
      throw err
    });
}

// cmd executes a command with options
function cmd(command, options) {
  let separator = process.platform === "win32" ? ";" : ":";

  // add node and npm executables to $PATH
  let env = Object.assign({}, process.env, options.env);
  env.PATH = path.resolve("/nodejs/bin") + separator + env.PATH;

  // delete env from options since it has already been handled
  delete options.env;

  // merge in options param
  options = Object.assign({ env }, options);

  // execute the command
  let output = execSync(command, options);
  console.log('Output:');
  console.log(output.toString('utf8'));
  console.log();
}

function install() {
  const start = Date.now();
  let fullBuildDir = path.join('/tmp/app', BUILD_DIR);
  console.log('Installing dependencies');
  cmd('npm install', {
    cwd: fullBuildDir,
    env: {
      NODE_ENV: "development" // this will install dev dependencies
    }
  });

  console.log(`Installed dependencies in ${Date.now() - start}ms`);
}

// downloadSource downloads the source code into /tmp/app
function downloadSource(callback) {
  const start = Date.now();
  console.log('Downloading source code');

  // helper function to clone from github
  githubClone('/tmp/app', () => {
    console.log(`Downloaded source code in ${Date.now() - start}ms`);
    callback();
  });
}

// build executes the build in /tmp/app/BUILD_DIR
function build() {
  const start = Date.now();
  let fullBuildDir = path.join('/tmp/app', BUILD_DIR);
  console.log('Executing build');
  cmd(BUILD_CMD, {
      cwd: fullBuildDir
  });

  console.log(`Build completed in ${Date.now() - start}ms`);
}

function publish(done) {
  const start = Date.now();
  console.log('Publishing to gh-pages');
  ghpages.publish(path.join('/tmp/app', BUILD_DIR, OUTPUT_DIR), {
    user: {
      name: 'Google Cloud Function',
      email: 'jakob.viskum.damgaard@gmail.com'
    }
  }, err => {
    console.log(`Published to gh-pages in ${Date.now() - start}ms`);
    done(err);
  });
}

exports.buildserverless = function buildserverless(req, res) {

  const start = Date.now();

  // download the source code
  downloadSource(() => {

    // install node deps
    install();

    // build the project
    build();

    // publish to gh-pages
    publish((err) => {
      if (err) {
        throw err
      }
      console.log(`Build completed in ${Date.now() - start}ms`)
      res.status(200).send();
    })


  });
};
