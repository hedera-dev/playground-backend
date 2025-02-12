# API

Playground exposes an API for managing packages and executing user-defined code.

The API is broken in to 2 main sections - packages and jobs.

The API is exposed from the container, by default on port 2000, at `/api/playground/`.

All inputs are validated, and if an error occurs, a 4xx or 5xx status code is returned.
In this case, a JSON payload is sent back containing the error message as `message`


## Health

### `GET /api/playground/health`

Returns the current time (Used to check health of the service)

#### Response
-   `{}.currentTime`: Curren Time

#### Example

```
GET /api/playground/health
```

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
    "currentTime": "Fri Nov 22 2024 12:30:17 GMT+0000 (Coordinated Universal Time)"
}
```

## Runtimes

### `GET /api/playground/runtimes`

Returns a list of available languages, including the version, runtime and aliases.

#### Response

-   `[].language`: Name of the language
-   `[].version`: Version of the runtime
-   `[].aliases`: List of alternative names that can be used for the language
-   `[].runtime` (_optional_): Name of the runtime used to run the langage, only provided if alternative runtimes exist for the language

#### Example

```
GET /api/playground/runtimes
```

```json
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
      "language": "java",
      "version": "21.0.2",
      "aliases": []
  },
  {
      "language": "javascript",
      "version": "20.11.1",
      "aliases": [
          "node-javascript",
          "node-js",
          "javascript",
          "js"
      ],
      "runtime": "node"
  }
]
```

## Execute

### `POST /api/playground/execute`

Runs the given code, using the given runtime and arguments, returning the result.

#### Request

-   `language`: Name or alias of a language listed in [runtimes](#runtimes)
-   `version`: SemVer version selector of a language listed in [runtimes](#runtimes)
-   `files`: An array of files which should be uploaded into the job context
-   `files[].content`: Content of file to be written
-   `files[].encoding` (_optional_): The encoding scheme used for the file content. One of `base64`, `hex` or `utf8`. Defaults to `utf8`.

#### Response

-   `language`: Name (not alias) of the runtime used
-   `version`: Version of the used runtime
-   `run`: Results from the run stage
-   `run.stdout`: stdout from run stage process
-   `run.stderr`: stderr from run stage process
-   `run.output`: stdout and stderr combined in order of data from run stage process
-   `run.code`: Exit code from run process, or null if signal is not null
-   `run.signal`: Signal from run process, or null if code is not null
-   `compile` (_optional_): Results from the compile stage, only provided if the runtime has a compile stage
-   `compile.stdout`: stdout from compile stage process
-   `compile.stderr`: stderr from compile stage process
-   `compile.output`: stdout and stderr combined in order of data from compile stage process
-   `compile.code`: Exit code from compile process, or null if signal is not null
-   `compile.signal`: Signal from compile process, or null if code is not null

#### Example

```json
POST /api/playground/execute
Content-Type: application/json

{
  "language": "js",
  "version": "15.10.0",
  "files": [
    {
      "content": "console.log(process.argv)"
    }
  ]
}
```

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "run": {
    "stdout": "[\n  '/Playground/packages/node/15.10.0/bin/node',\n  '/Playground/jobs/e87afa0d-6c2a-40b8-a824-ffb9c5c6cb64/my_cool_code.js',\n  '1',\n  '2',\n  '3'\n]\n",
    "stderr": "",
    "code": 0,
    "signal": null,
    "output": "[\n  '/Playground/packages/node/15.10.0/bin/node',\n  '/Playground/jobs/e87afa0d-6c2a-40b8-a824-ffb9c5c6cb64/my_cool_code.js',\n  '1',\n  '2',\n  '3'\n]\n"
  },
  "language": "javascript",
  "version": "15.10.0"
}
```

## Packages

### `GET /api/playground/packages`

Returns a list of all possible packages, and whether their installation status.

#### Response

-   `[].language`: Name of the contained runtime
-   `[].language_version`: Version of the contained runtime
-   `[].installed`: Status on the package being installed

#### Example

```
GET /api/playground/packages
```

```json
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
      "language": "java",
      "language_version": "21.0.2",
      "installed": true
  },
  {
      "language": "node",
      "language_version": "20.11.1",
      "installed": true
  }
]
```