# EntelPrice ERP

> **ERP Web Modular e Adaptativo para diferentes tipos de empresas.**

O **EntelPrice ERP** é uma plataforma de gestão empresarial projetada para se adaptar a diferentes tipos de negócios sem exigir a criação de um sistema completamente novo para cada empresa.

A plataforma utiliza uma arquitetura **modular, multiempresa e extensível**, permitindo que cada organização escolha seus módulos, departamentos, permissões, personalizações e aparência.

> **A ideia central:** o ERP não é feito para uma empresa específica. **Ele se adapta à empresa.**

---

## 📌 Visão geral

O EntelPrice ERP foi pensado para atender empresas de diferentes segmentos, como:

* 🛒 Mercados
* 🔧 Oficinas mecânicas
* 🏭 Indústrias
* 🏥 Clínicas
* 🍽️ Restaurantes
* 🏫 Escolas
* 🏪 Comércios
* 🏢 Empresas de serviços
* Entre outros

A mesma plataforma pode possuir configurações completamente diferentes dependendo da empresa que estiver utilizando o sistema.

### Exemplo

Um mercado pode utilizar:

```text
Estoque
Vendas
Compras
Financeiro
Produtos
Fornecedores
```

Enquanto uma oficina pode utilizar:

```text
Oficina
Ordens de serviço
Peças
Estoque
Clientes
Veículos
Financeiro
```

Ambos utilizam o mesmo **Core**, mas possuem módulos e configurações diferentes.

---

# 🧠 Conceito da arquitetura

A arquitetura do EntelPrice ERP é baseada na seguinte estrutura:

```text
Empresa
   ↓
Departamento
   ↓
Módulo
   ↓
Permissão
   ↓
Usuário
```

O **Core** fornece a infraestrutura principal do sistema, enquanto os módulos adicionam funcionalidades específicas.

```text
                 ENTELPRICE ERP
                       │
                     CORE
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Módulos        Empresas      Plugins
        │              │              │
        └──────────────┼──────────────┘
                       │
                Personalizações
                       │
                    Usuários
```

---

# 🏗️ Estrutura do projeto

A estrutura inicial do projeto foi planejada da seguinte forma:

```text
ERP/
│
├── core/
├── modules/
├── plugins/
├── custom/
├── companies/
├── themes/
├── storage/
├── database/
├── config/
├── public/
├── updates/
└── vendor/
```

---

# ❤️ Core

O diretório:

```text
core/
```

representa o coração do EntelPrice ERP.

Ele será responsável pelas funcionalidades fundamentais da plataforma:

* Autenticação
* Login
* Usuários
* Sessões
* Permissões
* Segurança
* Banco de dados
* Rotas
* APIs
* Gerenciamento de módulos
* Sistema de atualizações
* Logs
* Controle de integridade

O Core deve ser tratado como uma camada protegida do sistema.

### Princípio

```text
CORE ≠ PERSONALIZAÇÃO
```

Os módulos e personalizações devem utilizar as funcionalidades disponibilizadas pelo Core sem modificar diretamente sua estrutura.

---

# 🧩 Módulos

Os módulos ficam em:

```text
modules/
```

Exemplo:

```text
modules/

├── estoque/
├── financeiro/
├── vendas/
├── compras/
├── rh/
├── oficina/
└── crm/
```

Cada módulo possui sua própria estrutura:

```text
estoque/

├── manifest.json
├── install.php
├── uninstall.php
├── routes.php
├── controllers/
├── models/
├── views/
└── assets/
```

Um módulo deve poder ser:

* Instalado
* Desinstalado
* Atualizado
* Ativado
* Desativado

sem necessidade de alterar diretamente o Core.

---

# 🏢 Multiempresa

O EntelPrice ERP foi projetado para trabalhar com múltiplas empresas.

O diretório:

```text
companies/
```

poderá armazenar dados específicos de cada organização, como configurações, arquivos e personalizações.

Exemplo:

```text
companies/

├── empresa_001/
│   ├── config/
│   ├── custom/
│   └── uploads/
│
└── empresa_002/
    ├── config/
    ├── custom/
    └── uploads/
```

Isso permite que uma mesma instalação do ERP atenda diferentes empresas, cada uma com sua própria configuração.

---

# 🏬 Departamentos

Os departamentos não serão representados por diretórios.

Eles serão gerenciados pelo **banco de dados**.

### Exemplo — Mercado

```text
Mercado Silva

├── Almoxarifado
├── Financeiro
└── Vendas
```

### Exemplo — Oficina

```text
Oficina João

├── Oficina
├── Peças
└── Financeiro
```

Essa abordagem permite que a estrutura organizacional seja configurada dinamicamente.

---

# 🛠️ Personalizações

O diretório:

```text
custom/
```

será utilizado para personalizações específicas de cada empresa.

A principal regra é:

> **Personalizações não devem modificar diretamente o módulo original.**

### Exemplo — Mercado

O cadastro de produtos pode possuir:

```text
Produto

├── Nome
├── Preço
├── Validade
├── Lote
└── Marca
```

### Exemplo — Oficina

O cadastro de peças pode possuir:

```text
Peça

├── Nome
├── Modelo do veículo
├── Ano
├── Código OEM
└── Fabricante
```

Assim, o sistema consegue evoluir sem perder a compatibilidade com os módulos originais.

---

# 🔌 Plugins

Plugins são extensões menores que adicionam funcionalidades específicas.

Localização:

```text
plugins/
```

Exemplos:

```text
plugins/

├── whatsapp/
├── pix/
├── email/
└── assinatura_digital/
```

Os plugins poderão fornecer integrações e recursos adicionais sem fazer parte obrigatoriamente do Core.

---

# 🎨 Themes

A aparência do sistema será separada da lógica de negócio.

Diretório:

```text
themes/
```

Exemplo:

```text
themes/

├── padrao/
├── dark/
└── empresa_personalizada/
```

Isso permite alterar a identidade visual sem modificar as funcionalidades internas do ERP.

---

# 💾 Storage

Arquivos gerados pelo sistema ficarão no diretório:

```text
storage/
```

Estrutura planejada:

```text
storage/

├── uploads/
├── documentos/
├── backups/
├── logs/
└── cache/
```

---

# 🗄️ Banco de dados

O banco de dados será responsável por armazenar as informações dinâmicas da plataforma.

Entre as principais entidades planejadas estão:

```text
empresas
usuarios
departamentos
permissoes
modulos
```

Além das tabelas de relacionamento:

```text
empresa_modulo
departamento_modulo
usuario_permissao
```

A estrutura poderá evoluir conforme novos recursos forem adicionados ao sistema.

---

# 📦 Sistema de instalação de módulos

Uma das funcionalidades fundamentais do EntelPrice ERP será o sistema de instalação dinâmica de módulos.

Fluxo planejado:

```text
Administrador
      ↓
Enviar módulo ZIP
      ↓
Sistema verifica o pacote
      ↓
Validação do manifest.json
      ↓
Extração do módulo
      ↓
Execução do install.php
      ↓
Criação de tabelas
      ↓
Registro de menus
      ↓
Registro de permissões
      ↓
Módulo instalado
```

Isso permitirá que novos recursos sejam adicionados ao ERP sem alterar diretamente sua base.

---

# 🔐 Segurança e proteção do Core

O diretório:

```text
core/
```

deverá possuir proteção especial.

Entre as regras planejadas:

* Não permitir edição pelo painel administrativo
* Impedir exclusão pelo sistema
* Impedir criação arbitrária de arquivos
* Verificar alterações nos arquivos
* Utilizar atualizações oficiais
* Registrar alterações importantes
* Verificar integridade dos arquivos

Uma possibilidade futura é utilizar **hashes dos arquivos do Core** para detectar modificações não autorizadas.

Exemplo conceitual:

```text
Arquivo original
      ↓
Hash esperado
      ↓
Comparação
      ↓
Arquivo atual
      ↓
┌───────────────┐
│ Igual?        │
├───────────────┤
│ SIM → OK      │
│ NÃO → ALERTA  │
└───────────────┘
```

---

# 🧪 Homologação e produção

O projeto deverá possuir uma separação clara entre ambientes de teste e produção.

### Homologação

Utilizada para:

* Desenvolvimento
* Testes
* Validação
* Testes de módulos
* Testes de atualizações

```text
HOMOLOGAÇÃO
```

### Produção

Ambiente utilizado pela empresa.

```text
PRODUÇÃO
```

Fluxo planejado:

```text
Desenvolver
    ↓
Testar
    ↓
Aprovar
    ↓
Publicar
    ↓
Atualizar produção
```

---

# 🧑‍💻 SDK

No futuro, o EntelPrice ERP deverá possuir um **SDK para desenvolvimento de módulos**.

Um desenvolvedor poderá criar um módulo seguindo um padrão como:

```text
modulo-oficina/

├── manifest.json
├── install.php
├── uninstall.php
├── routes.php
├── controllers/
├── models/
├── views/
└── assets/
```

O ERP poderá identificar automaticamente o módulo através do `manifest.json`.

---

# 🖥️ IDE Web — Futuro

Uma funcionalidade planejada para versões futuras é uma **IDE integrada ao próprio ERP**.

A ideia é permitir que equipes de TI criem e personalizem funcionalidades diretamente pelo navegador.

Possíveis recursos:

* Criar módulos
* Criar campos
* Criar tabelas
* Criar menus
* Criar botões
* Criar relatórios
* Criar dashboards
* Criar formulários
* Configurar permissões

---

# ⚙️ Tecnologias

## Primeira versão

### Frontend

```text
HTML
CSS
JavaScript
```

### Backend

```text
PHP
```

### Banco de dados

```text
MySQL
```

---

## 🚀 Tecnologias planejadas para o futuro

O projeto poderá evoluir para utilizar:

* Laravel
* React
* Vue.js
* API REST
* Docker
* Redis
* Aplicativo mobile

A adoção dessas tecnologias dependerá da evolução da arquitetura e das necessidades do projeto.

---

# 📈 Roadmap

O roadmap inicial do projeto pode ser dividido em etapas.

### Fase 1 — Core

* [ ] Estrutura inicial do projeto
* [ ] Sistema de configuração
* [ ] Conexão com banco de dados
* [ ] Autenticação
* [ ] Usuários
* [ ] Sessões
* [ ] Permissões
* [ ] Sistema de rotas
* [ ] Logs

### Fase 2 — Sistema de módulos

* [ ] Estrutura de módulos
* [ ] `manifest.json`
* [ ] Instalação de módulos
* [ ] Desinstalação de módulos
* [ ] Ativação/desativação
* [ ] Sistema de dependências
* [ ] Gerenciamento de versões

### Fase 3 — Multiempresa

* [ ] Cadastro de empresas
* [ ] Departamentos
* [ ] Relacionamento empresa/módulo
* [ ] Configurações por empresa
* [ ] Uploads por empresa
* [ ] Personalizações

### Fase 4 — Módulos empresariais

* [ ] Estoque
* [ ] Financeiro
* [ ] Vendas
* [ ] Compras
* [ ] CRM
* [ ] RH
* [ ] Oficina

### Fase 5 — Extensibilidade

* [ ] Sistema de plugins
* [ ] SDK
* [ ] API REST
* [ ] Sistema de temas
* [ ] Sistema de atualizações

### Fase 6 — Recursos avançados

* [ ] IDE Web
* [ ] Dashboards
* [ ] Construtor de formulários
* [ ] Construtor de relatórios
* [ ] Automação
* [ ] Aplicativo mobile

---

# 🌐 Instalação

> **Em desenvolvimento**

As instruções oficiais de instalação serão adicionadas conforme o primeiro ambiente funcional do EntelPrice ERP estiver disponível.

A instalação deverá futuramente contemplar:

```text
1. Requisitos do servidor
2. Download do projeto
3. Configuração do ambiente
4. Configuração do banco de dados
5. Configuração do sistema
6. Criação do administrador
7. Instalação dos módulos
8. Acesso ao painel
```

---

# 📂 Arquitetura resumida

```text
EntelPrice ERP
│
├── Core
│   ├── Segurança
│   ├── Usuários
│   ├── Permissões
│   ├── Banco de dados
│   ├── Rotas
│   └── APIs
│
├── Empresas
│   ├── Configurações
│   ├── Uploads
│   └── Personalizações
│
├── Módulos
│   ├── Estoque
│   ├── Financeiro
│   ├── Vendas
│   ├── Compras
│   ├── RH
│   └── Outros
│
├── Plugins
│   ├── WhatsApp
│   ├── PIX
│   ├── E-mail
│   └── Assinatura Digital
│
└── Themes
    ├── Padrão
    ├── Dark
    └── Personalizado
```

---

# 🎯 Objetivo

O objetivo do EntelPrice ERP é criar mais do que um simples sistema de gestão empresarial.

A proposta é construir uma **plataforma empresarial adaptável**, capaz de atender diferentes segmentos utilizando a mesma infraestrutura.

O Core fornece a base.

Os módulos fornecem as funcionalidades.

Os departamentos organizam a empresa.

As permissões controlam o acesso.

As personalizações adaptam o sistema.

Os plugins ampliam suas capacidades.

Os temas permitem personalizar a interface.

---

# 💡 Visão do projeto

```text
                    ENTELPRICE ERP
                          │
                          ▼
                 PLATAFORMA EMPRESARIAL
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Mercado       Oficina      Indústria
             │            │            │
             ▼            ▼            ▼
          Módulos       Módulos      Módulos
             │            │            │
             └────────────┼────────────┘
                          ▼
                    MESMO CORE
```

A visão de longo prazo é transformar o EntelPrice ERP em uma plataforma onde uma empresa possa **montar seu próprio ERP**, escolhendo os recursos necessários para sua operação.

---

# 📜 Status

🚧 **Em desenvolvimento**

O projeto está em fase de planejamento e construção da arquitetura inicial.

A estrutura poderá sofrer alterações conforme o desenvolvimento do Core e dos primeiros módulos.

---

# 🤝 Contribuição

Contribuições poderão ser adicionadas futuramente conforme as regras de desenvolvimento do projeto forem definidas.

Para grandes alterações arquiteturais, recomenda-se discutir a proposta antes da implementação.

---

# 📄 Licença

> A licença do projeto ainda não foi definida.

---

# 👨‍💻 EntelPrice

**EntelPrice ERP**

> Um ERP que se adapta à empresa — não uma empresa que precisa se adaptar ao ERP.
