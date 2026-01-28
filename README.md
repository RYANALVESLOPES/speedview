# SpeedView - Professional Network Diagnostic

![Project Status](https://img.shields.io/badge/status-concluído-success)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)

> **Uma solução moderna e de alta performance para diagnóstico de rede, focada na experiência do usuário (UI/UX) e precisão técnica.**

---

## 📸 Preview

![Dashboard Preview](./assets/preview.png)
---

## 🚀 Sobre o Projeto

O **SpeedView** é uma aplicação Single Page Application (SPA) desenvolvida para realizar testes de qualidade de conexão de internet (Banda Larga e Fibra Óptica).

Diferente de soluções genéricas, este projeto foi arquitetado com foco em **Performance** e **Resiliência**, utilizando APIs nativas do navegador para medir o fluxo de dados em tempo real sem a necessidade de plugins pesados (Flash/Java).

O design adota o estilo **Glassmorphism/Neon**, alinhado com tendências modernas de interfaces para provedores de internet (ISPs).

---

## 🛠️ Stack Tecnológica

O projeto foi construído utilizando as ferramentas mais modernas do mercado de Front-end:

* **[React](https://reactjs.org/):** Biblioteca principal para construção da interface reativa e gerenciamento de estado.
* **[Vite](https://vitejs.dev/):** Build tool de próxima geração para garantir carregamento instantâneo e HMR (Hot Module Replacement).
* **[Tailwind CSS](https://tailwindcss.com/):** Framework "utility-first" para estilização responsiva e design system consistente.
* **JavaScript (ES6+):** Lógica de medição pura utilizando `ReadableStream` e `XMLHttpRequest`.

---

## ⚡ Diferenciais Técnicos (Engine de Medição)

O núcleo do sistema possui uma engenharia robusta para lidar com as limitações de navegadores:

### 1. Medição de Download via Streams
Utiliza a API `ReadableStream` para ler o fluxo de dados (`chunks`) conforme eles chegam do servidor (Cloudflare Edge). Isso permite:
* Visualização do ponteiro subindo em **tempo real**.
* Precisão milimétrica no cálculo de Mbps.

### 2. Sistema Híbrido de Upload (Smart Fallback)
Um dos maiores desafios em testes via browser (Client-side) é o bloqueio de **CORS** (Cross-Origin Resource Sharing) ao tentar realizar uploads reais para servidores públicos.

Para resolver isso, desenvolvi uma arquitetura de **Fallback Inteligente**:
1.  **Tentativa Real:** O sistema tenta realizar um upload real via `XMLHttpRequest` (POST).
2.  **Detecção de Bloqueio:** Se o navegador ou rede bloquear a requisição (comum em localhost ou redes corporativas), o sistema detecta o erro instantaneamente.
3.  **Modo de Compatibilidade:** Ativa automaticamente um algoritmo de estimativa proporcional baseado na latência e download, garantindo que a experiência do usuário nunca seja interrompida ou mostre "0 Mbps".

---

## 📦 Como Rodar o Projeto

Pré-requisitos: Você precisa ter o [Node.js](https://nodejs.org/) instalado.

```bash
# 1. Clone este repositório
git clone [https://github.com/RYANALVESLOPES/speedview.git](https://github.com/RYANALVESLOPES/speedview)

# 2. Entre na pasta do projeto
cd speedview

# 3. Instale as dependências
npm install

# 4. Rode o servidor de desenvolvimento
npm run dev