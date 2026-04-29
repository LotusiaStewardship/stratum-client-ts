const { series, parallel, watch } = require('gulp')
const { spawn } = require('node:child_process')
const { access, mkdir, readFile, rm, writeFile } = require('node:fs/promises')
const path = require('node:path')

const DIST_DIR = 'dist'
const ESM_DIR = path.join(DIST_DIR, 'esm')
const CJS_DIR = path.join(DIST_DIR, 'cjs')
const TYPES_DIR = path.join(DIST_DIR, 'types')
const SOURCE_GLOBS = ['index.ts', 'node.ts', 'lib/**/*.ts']

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) return resolve()
      reject(new Error(`${command} ${args.join(' ')} exited with status ${code}`))
    })
  })
}

async function clean() {
  await rm(DIST_DIR, { recursive: true, force: true })
}

function buildTypes() {
  return run('npx', ['tsc', '-p', 'tsconfig.types.json'])
}

function transpileEsm() {
  return run('npx', ['tsc', '--outDir', ESM_DIR])
}

async function writeEsmPackageJson() {
  await mkdir(ESM_DIR, { recursive: true })
  await writeFile(path.join(ESM_DIR, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
}

const buildEsm = series(transpileEsm, writeEsmPackageJson)

function buildCjs() {
  return run('npx', ['tsc', '-p', 'tsconfig.cjs.json'])
}

async function validate() {
  await Promise.all([
    access(path.join(ESM_DIR, 'index.js')),
    access(path.join(ESM_DIR, 'package.json')),
    access(path.join(CJS_DIR, 'index.js')),
    access(path.join(TYPES_DIR, 'index.d.ts')),
  ])

  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'))
  await Promise.all([access(pkg.main), access(pkg.module), access(pkg.types)])
}

const build = series(clean, parallel(buildTypes, buildEsm, buildCjs), validate)

function buildWatch() {
  return watch(SOURCE_GLOBS, { ignoreInitial: false }, series(buildTypes, buildEsm, buildCjs))
}

exports.clean = clean
exports['build:types'] = buildTypes
exports['build:esm'] = buildEsm
exports['build:cjs'] = buildCjs
exports.validate = validate
exports.build = build
exports.watch = buildWatch
exports.default = build
