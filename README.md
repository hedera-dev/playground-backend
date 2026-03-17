# Playground

This project provides an environment for users to execute code related to the **Hedera network**, allowing them to test functionalities using the Hedera SDK. Currently, the following languages and versions are supported:

- **Java**: `21.0.2` with Hedera SDK `2.64.0`
- **JavaScript**: `22.16.0` with Hiero SDK `2.75.0`
- **Rust**: `1.85.1` with Hiero SDK `0.40.0`
- **Go**: `1.25.4` with Hiero SDK `2.73.0`

---

## Repository Structure

- **`infrastructure/`**
  Contains everything required to deploy the infrastructure using **Terraform**. This directory manages configurations for cloud resources such as networking, servers, and storage.

- **`app/`**
  Includes the core of the application:
  - **`ai-assistant/`**: HTTP Streaming API (TypeScript + Fastify) powering the Hedera Playground AI assistant.
  - **`playground-api/`**: Backend interface that connects the frontend to Playground code execution functionalities.
  - **`spoe-auth/`**: HAProxy SPOE authentication service that validates PASETO v4 tokens.
  - **`builder/`**: Generates runtime packages to support multiple languages and their respective versions.

---

## Getting Started

### Prerequisites

- Node.js 22+
- Go 1.25+
- Docker

### Setup

After cloning the repository, install the root dependencies to enable git hooks:

```bash
npm install
```

This sets up [Husky](https://typicode.github.io/husky/) with the following hooks:
- **`commit-msg`**: Enforces [Conventional Commits](https://www.conventionalcommits.org/) format with `Signed-off-by` trailer.
- **`pre-push`**: Runs a build of any modified package before pushing (`app/ai-assistant` only — Go packages are compiled in CI).

> **Windows users**: Git hooks require a POSIX shell. Use [Git Bash](https://gitforwindows.org/) or WSL.

### Commit format

```
<type>(<scope>): <description>

Signed-off-by: Your Name <your@email.com>
```

Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`.

---

## Features

- **Interactive Code Execution**: Users can run Hedera SDK code directly in the Playground for hands-on experimentation.
- **Multi-language Support**: Supports Java, JavaScript, Rust and Go, with plans to extend to additional languages.
- **AI Assistant**: Integrated AI assistant to help users with Hedera SDK questions and code generation.
- **Scalable Deployment**: Infrastructure deployed using Terraform on GCP.

---
