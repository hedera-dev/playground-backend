# Playground

This project provides an environment for users to execute code related to the **Hedera network**, allowing them to test functionalities using the Hedera SDK. Currently, the following languages and versions are supported:

- **Java**: `21.0.2` with Hedera sdk `2.46.0`
- **JavaScript**: `20.11.1` with Hedera sdk `2.56.0`
- **Rust**: `1.85.1` with Hedera sdk `0.32.0`

The repository is structured to facilitate development, deployment, and scalability of the Playground.

---

## 🏗️ Repository Structure

- **`infrastructure/`**  
  Contains everything required to deploy the infrastructure using **Terraform**. This directory manages configurations for cloud resources such as networking, servers, and storage to ensure a robust environment for the Playground.

- **`app/`**  
  Includes the core of the application:
  - **Playground API**: Provides the backend interface that connects the frontend to Playground functionalities.
  - **Builder**: Generates packages to support multiple languages and their respective versions (currently Java and JavaScript).

---

## 🚀 Features

- **Interactive Code Execution**: Users can run Hedera SDK code directly in the Playground for hands-on experimentation.
- **Multi-language Support**: Currently supports Java and JavaScript, with plans to extend support to additional languages in the future.
- **Scalable Deployment**: Infrastructure is deployed using Terraform, ensuring flexibility and scalability for production environments.

---