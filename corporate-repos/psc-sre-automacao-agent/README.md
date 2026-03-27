# psc-sre-automacao-agent

## Lista de clusters onde o Agent já existe e está funcional

### Desenvolvimento (DES)

| Cluster | JWT | Observação |
|---------|-----|------------|
| k8sdesaz2b11c | TRUE | Não atualizando versão no argo |
| k8sdesbb111 | TRUE | Atualizado |
| k8sdesbb111b | TRUE | Atualizado |
| k8sdesbb1azza | TRUE | Atualizado |
| k8sdesbb211d | TRUE | Atualizado |
| k8sdesbb2b11e | TRUE | Atualizado |

### Homologação (HML)

| Cluster | JWT | Observação |
|---------|-----|------------|
| k8shmlaz111a | FALSE | Não funcional (Argo não encontrado) |
| k8shmlaz2b11c | TRUE | Puxando versão antiga (2.0.2) |
| k8shmlbb111 | TRUE | Atualizado |
| k8shmlbb111b | TRUE | Atualizado |
| k8shmlbb211d | TRUE | Atualizado |
| k8shmlbb2b11e | TRUE | Atualizado |

### Produção (PRD)

| Cluster | JWT | Observação |
|---------|-----|------------|
| k8sprdaz111a | FALSE | Não funcional (Argo não encontrado) |
| k8sprdbb111 | TRUE | Atualizado |
| k8sprdbb111b | TRUE | Não atualizando versão no argo |
| k8sprdbb111d | TRUE | Atualizado |
| k8sprdbb1b11e | FALSE | Cadastrar Secret |
| k8sprdbb211 | TRUE | Container não sobe no POD |
| k8sprdbb211b | TRUE | Container não sobe no POD |
| k8sprdbb211d | TRUE | Container não sobe no POD |
| k8sprdbb2b11e | TRUE | Container não sobe no POD |

---

psc-sre-automacao-agent é um microsserviço que ....(Insira aqui a descrição da sua aplicação)

**Atenção**: Esse documento deve servir como guia para novos desenvolvedores por isso sempre manter ele atualizado com as dependencias necessarias para se executar esse projeto,
como por exemplo as configurações das variaveis de ambiente (environments) e os sistemas que ele precisa para funcionar corretamente, como curio, rotinas de banco, etc...

1. [Executar](#executar)
2. [Componentes](#componentes)
3. [Testes](#testes)
4. [Instruções Adicionais](#instruções-adicionais)

## Executar

Para executar esse projeto foi criado um script na pasta `/run`, chamado `run.sh`.
Ele centraliza algumas ações, como a verificação se seu sistema operacional possui as configurações necessarias,
realiza a atualização do settings.xml com seu usuario e senha para autenticar no atf.
Possui a opção de executar o projeto usando o docker compose ou executar localmente e com a opção de subir uma instancia do Curio usando o
docker caso precise de se comunicar com o iib.
Esses comandos estão descritos na inicialização do script.

Para executar o script, utilize o comando abaixo, na pasta raiz do projeto:

```bash
./run/run.sh
```

Caso ocorra a execução dos scripts apresente o erro `-bash: cd: /run/run.sh: Not a directory` altere a permissão do arquivo para permitir
sua execução e tente novamente, conforme os comandos abaixo:

``` bash
chmod +x ./run/run.sh
./run/run.sh
```

Em qualquer um dos casos de execução, para verificar se sua aplicação subiu corretamente, verifique se o script está em execução ou acesso o endereço `http://localhost:3000/` onde você terá uma mensagem caso sua aplicação esteja rodando.

## Componentes:

Esta apliçação foi criada usando o `bb-dev-generator` que ja cria uma configuração inicial do projeto com os seguintes componentes:


| Componente | Descrição                                            | Endpoint                         |
|:-----------|:-----------------------------------------------------|:---------------------------------|
| *Info*     | Informaçoes da aplicacao                             | [http://localhost:3000/info]     |
| *Docs*     | Documentação da api                                  | [http://localhost:3000/api-docs] |
| *Metrica*  | Metricas expostas pela aplicação                     | [http://localhost:3000/metrics]  |
| *Ready*    | Indica que a aplicação está pronta para responder    | [http://localhost:3000/ready]    |
| *Health*   | Indica que a aplicação está operando normalmente     | [http://localhost:3000/health]   |

### Swagger:

A geração do swagger ocorre em tempo de **Build** e fica disponível na rota `/api-docs`, quando habilitado.

Por padrão, o api-docs é gerado, mas também precisa ser habilitado em cada ambiente. Além disso, o api-docs **não pode ser disponibilizado/habilitado em ambiente de produção.**

Para habilitá-lo em ambientes de desenvolvimento e de homologação, adicione a variável de ambiente no deployment do `values.yaml` correspondente conforme abaixo:

```
- name: "NODE_ENV"
  value: "development"
```

Já para habilitá-lo em ambiente local, altere essa variável no `run/docker-compose.yml` conforme abaixo:

```
NODE_ENV: localhost
```

- Contudo, observe que, neste último caso, também será habilitada a página index.html, presente em `static/index.html`. Caso **não** queira habilitá-la, pode utilizar também o valor `development` em ambiente local.

Em ambiente local, caso rode a aplicação sem executar o docker-compose.yml, pode também exportar a variável rodando o comando abaixo via terminal:

```
export NODE_ENV=localhost
```

> :exclamation: **Obs.:** Via de regra, a página `index.html` somente deve ser habilitada para ser mostrada em ambiente local.

### Curió:

**Obs.: Esta seção só se refere a projetos que utilizam o Curió seja consumindo ou provendo operações.**

As configurações do curio ficam no arquivo `.env_curio`, e contem todas as informações que o curio precisa, elas vao ser comitadas no repositorio.
Ela possui as seguintes propriedades para o ambiente de desenvolvimento

| Nome da Env                     | Descrição do valor                                                 | Valor Padrão                         |
|:--------------------------------|:-------------------------------------------------------------------|:-------------------------------------|
| KUMULUZEE_SERVER_HTTP_PORT      | Porta do Curio                                                     | 8081                                 |
| CURIO_CACHE_CONFIGURACAO_IIB    | endereco do redis de desenv                                        | iib-slave.redis.bdh.desenv.bb.com.br |
| CURIO_CACHE_CONFIGURACAO_IIB_ID | endereco do cache iib                                              | iib:configuracao:k8s-integracao      |
| CURIO_SIGLA_APLICACAO           | sigla do sistema que vai usar o curio                              | t99                             |
| CURIO_APLICACAO_HOST            | endereço da aplicação para o curio enviar requisição de provimento | http://localhost:3000                |
| CURIO_IIB_LOG_LEVEL             | sigla do sistema                                                   | FINE                                 |
| CURIO_DRY_RUN                   | sigla do sistema                                                   | false                                |
| CURIO_MODO_DESENVOLVIMENTO      | Indicação para mode de desenvolvimento                             | true                                 |
| KUMULUZEE_LOGS_LOGGERS0_NAME    | pacote das classes que serão logadas                               | br.com.bb                            |
| KUMULUZEE_LOGS_LOGGERS0_LEVEL   | Nivel do log do curio                                              | TRACE                                |
| CURIO_OP_PROVEDOR               | Operacoes de provimento                                            | Opxxxx-vxx                           |
| CURIO_OP_CONSUMIDOR             | Operacoes de consumo                                               | Opxxxx-vxx                           |

### Biblioteca JavaScript Erro

Para tratativa de erros conforme padrão do BB, temos uma biblioteca para realizar o log e o tratamento de erro de aplicações Javascript.

A biblioteca está integrada no projeto com a lib dev-javascript-erro. Além disso, há um exemplo de sua utilização no controller `/src/controller/hello-world.controller.ts`

Para mais informações sobre o dev-javascript-erro, consulte a [documentação](https://fontes.intranet.bb.com.br/dev/dev-javascript-erro) da biblioteca.

## Testes

Para execução dos testes, está sendo usado o framework
[Jest](https://jestjs.io/). Os comandos de teste podem ser encontrados no
package.json. A estrutura de diretórios para os testes é:

- Testes unitários: `src/__tests__/unit`;

Para executar os testes, utilize o seguinte comando:

```bash
npm test
```

## Instruções Adicionais

**_Sumário_**

- [Verificando o driver do IBM DB2](#verificando-o-driver-do-ibm-db2)
- [Implementação](#implementação)
  - [Como criar um serviço rest](#como-criar-um-serviço-rest)
  - [Como criar um controller com trace](#como-criar-um-controller-com-trace)
  - [Como criar um modelo que será utilizado na base de dados](#como-criar-um-modelo-que-será-utilizado-na-base-de-dados)
    - [Incluindo o modelo criado na factory do sequelize](#incluindo-o-modelo-criado-na-factory-do-sequelize)
    - [Informando o tipo de banco de dados e as credenciais](#informando-o-tipo-de-banco-de-dados-e-as-credenciais)
  - [Utilizando o Swagger](#utilizando-o-swagger)
  - [Comandos Docker em desenvolvimento](#comandos-docker-em-desenvolvimento)
- [Testes de integração com o banco usando Testcontainers](#testes-de-integração-com-o-banco-usando-testcontainers)
  - [Subida do container](#subida-do-container)
  - [Conexão com o banco através do Sequelize](#conexão-com-o-banco-através-do-sequelize)
  - [Parada do container e desconexão com o banco de dados](#parada-do-container-e-desconexão-com-o-banco-de-dados)

### Verificando o driver do IBM DB2

**Obs.: Esta seção só se refere a projetos que se conectam a bancos IBM DB2.**

Em projetos que usam bancos IBM DB2, usa-se o pacote `ibm_db` para realizar
essa conexão. Na etapa de instalação dos pacotes do projeto (`npm install`),
o pacote `ibm_db` internamente faz o download do driver de conexão com o banco.

Porém, em alguns sistemas, como no Pengwin WSL executando dentro da rede do
banco, pode ocorrer uma falha de comunicação do proxy com o site externo do
driver, e sua instalação falha.

### Correção automática

Foi feito um script no package.json chamado `configDB2`, ao rodar npm install, ele já executa o script automaticamente, 
corrigindo o bug do db2. Caso não funcione, fazer a instalação manual abaixo. 

### Correção manual

Nesse caso, é necessário realizar comandos manuais para a instalação do driver.
Pode-se averiguar que o driver não foi instalado quando:

- Não existe a pasta `node_modules/ibm_db/build` e/ou existe o arquivo
  `node_modules/ibm_db/installer/linuxx64_odbc_cli.tar.gz` e ele possui 0 kB;
- Ao rodar o projeto ou rodar os testes, acontecem a seguinte falha ao tentar se
  conectar ao banco e não encontrar os arquivos necessários do driver:

  ```plaintext
  Could not locate the bindings file. Tried:
  → node_modules/ibm_db/build/odbc_bindings.node
  → node_modules/ibm_db/build/Debug/odbc_bindings.node
  ...

  14 |     }
  15 |
  > 16 |     const sequelize = new Sequelize({
      |                       ^
  17 |       dialect: environment.relationalDB.dialect as Dialect,
  18 |       database: environment.relationalDB.database,
  19 |       schema: environment.relationalDB.schema,
  ```

Dessa forma, deve-se baixar manualmente o driver, configurar a variável de
ambiente `IBM_DB_INSTALLER_URL` e instalar novamente o pacote `ibm_db`. Os
comandos a serem executados são:

```bash
# 1. Entrar na pasta do projeto
cd <projeto>

# 2. Baixar o arquivo comprimido do driver (ao invés do wget, pode-se usar outros comandos, ou até mesmo o browser).
# Se o comando falhar com a mensagem "Issue certificate not yet valid", tente
# rodar novamente com a flag --no-check-certificate.
wget https://public.dhe.ibm.com/ibmdl/export/pub/software/data/db2/drivers/odbc_cli/linuxx64_odbc_cli.tar.gz

# 3. Remover a pasta node_modules/ibm_db, caso exista
rm -rf node_modules/ibm_db

# 4. Configurar a variável de ambiente IBM_DB_INSTALLER_URL
# Referência: https://github.com/ibmdb/node-ibm_db#important-environment-variables-and-download-essentials
export IBM_DB_INSTALLER_URL=$PWD

# 5. Instalar novamente o pacote ibm_db
npm install

# 6. Opcional: remover o arquivo comprimido do driver
rm linuxx64_odbc_cli.tar.gz
```

- **Obs. 1:** Esses comandos devem ser executados toda vez que for instalado
  novamente o pacote `ibm_db`.

- **Obs. 2:** A pipeline do Jenkins de Javascript já está configurada de forma
  que permite o download do driver com sucesso, sem necessidade de intervenção
  manual.

### Implementação

#### Como criar um serviço REST

- Navegue até a pasta `src/routes`
- Crie o arquivo que irá definir sua rota (exemplo: `user.api.ts`)
- Seu arquivo deverá ter um construtor que recebe um objeto do tipo Router,
  conforme o modelo abaixo:

  ```typescript
  import { Router } from "express";

  export class UserAPI {
    constructor(router: Router) {
      // ...
    }
  }

  export default UserAPI;
  ```

- Navegue até o arquivo `src/routes/api.ts`
- Modifique o arquivo para receber seu router
- Inclua a chamada da sua classe dentro do construtor, isso fará com que todas
  as rotas sejam mapeadas pela aplicaçao, seguindo o exemplo abaixo:

  ```typescript
  import { UserAPI } from "./user.api";

  export class ApisRouter {
    constructor(router: Router) {
      new UserAPI(router);
    }
  }

  export default ApisRouter;
  ```

- Retorne à sua classe de rotas (exemplo: `user.api.ts`)
- Crie um método estático, assíncrono, e que receba os três parametros abaixo:

  ```typescript
  req: Request, resp: Response, next: NextFunction
  ```

- Seu método também deverá retornar uma promise. Sua implementação ficará
  parecida com o exemplo abaixo:

  ```typescript
  private static async findAllUsers(
    req: Request,
    resp: Response,
    next: NextFunction
  ) {
    try {
      resp.json({ "success" : true });
      return next();
    } catch (error) {
      return next(error);
    }
  }
  ```

- Volte ao construtor, e adicione o método como handler na rota

  ```typescript
  constructor(router : Router) {
    router.get("/users", UserAPI.findAllUsers);
  }
  ```

#### Como criar um controller com trace

- Navegue até a pasta `src/controller`
- Crie seu arquivo (exemplo: `user.controller.ts`)
- Importe as classes do Jaeger
- Insira o decortator @traceable, acima da classe
- Seu código ficará parecido com o exemplo abaixo:

  ```typescript
  import { setTagSpan, traceable } from "jaeger-tracer-decorator";

  @traceable()
  export class UserController {
    @setTagSpan("User")
    private tagParaTracer: any;

    // @traceable() - insira o traceable caso o método passe pelo trace
    public static async findAllUsers() {
      const users = await UserModel.findAll({ raw: true });
      return users;
    }
  }

  export default UserController;
  ```

- Você depois pode importar seu controller na API (exemplo:
  `src/routes/user.api.ts`) e realizar a invocação dos métodos

#### Como criar um modelo que será utilizado na base de dados

- Navegue até a pasta `src/model`
- Crie seu arquivo (exemplo: `user.model.ts`)
- Sua classe deverá importar os seguintes módulos: Table, Column, Model
- Sua classe deverá estender a classe Model
- Sua classe deverá possuir a anotação @Table
- Suas variáveis precisarão ter a anotação @Column
- Sua classe ficará parecida com o exemplo abaixo:

  ```typescript
  import { Table, Column, Model } from "sequelize-typescript";

  @Table
  export class UserModel extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column
    public id!: number;

    @Column
    public name!: string;

    @Column
    public age!: number;
  }

  export default UserModel;
  ```

##### Incluindo o modelo criado na factory do sequelize

- Navegue até o arquivo src/config/database.config.ts
- Faça a importação da sua classe recém criada

  ```typescript
  import { UserModel } from "../model/user.model";
  ```

- Dentro do método `getConnection`, acrescente seu modelo na instanciação do
  Sequelize:

  ```typescript
  const sequelize = new Sequelize({
    // ...
    models: [/* ..., */ UserModel],
  });
  ```

##### Informando o tipo de banco de dados e as credenciais

- Navegue até o arquivo `src/config/environment.ts`
- Encontre a variável relationalDB
- Modifique seus atributos de acordo com o desejado

  ```typescript
  relationalDB: {
    database: "nome_base_dados",
    dialect: "", // "sqlite" | "db2" | "oracle" | "postgres"...
    username: "",
    password: "",
    storage: ":memory:",
  },
  ```

#### Utilizando o Swagger

Estamos utilizando a lib TSOA. Pode-se obter mais detalhes em:
<https://tsoa-community.github.io/docs/>.

#### Comandos Docker em desenvolvimento

Para criar a imagem em Docker, utilize o seguinte comando

```typescript
sudo docker build -t node22_template .
```

Para executar a imagem criada, execute o comando abaixo

```typescript
sudo docker run node22_template
```

### Testes de integração com o banco usando Testcontainers

Os testes de integração que precisam usar a conexão com o banco são feitas
usando o framework TestContainers. Ele é responsável por subir e providenciar um
container com a imagem desejada do banco de dados, leve e fácil de operar para
testes.

Mais informações podem ser encontradas em:

- <https://testcontainers.com>
- <https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs>
- <https://node.testcontainers.org>

Para realizar um teste de integração com o banco de dados, deve-se realizar os
comandos das seções abaixo. Para este exemplo, iremos usar a imagem do Oracle
DB: <https://hub.docker.com/r/gvenzl/oracle-free>.

#### Subida do container

- Pesquisar a imagem desejada no Docker Hub (exemplo:
  <https://hub.docker.com/r/gvenzl/oracle-free>).

  Com isso, instancia-se um novo container com o comando
  `new GenericContainer(<nome-da-imagem>)`

- Entender quais são as variáveis de ambiente necessárias a serem passadas para
  o container (ex: `ORACLE_DATABASE`, `APP_USER`, `APP_USER_PASSWORD`).

  Com o novo container, deve-se chamar o método `.withEnvironment({ ... })`,
  passando como argumento o objeto contendo as variáveis de ambiente na forma de
  chave-valor.

- Verificar a sua necessidade de usar um script de carga/seed, e entender como
  aquela imagem faz para rodar scripts de carga, para copiar para dentro do
  container os arquivos necessários (ex: copiar para a pasta
  `/container-entrypoint-initd.d`).

  Com o novo container, deve-se chamar o método
  `.withCopyDirectoriesToContainer([{ source: "...", target: "..." }])`

- Verificar qual a porta do container que deve ser exposta (ex: 1521).

  Com o novo container, deve-se chamar o método `.withExposedPort(<porta>)`

- Entender qual o critério que indica que o container está pronto para ser usado
  (ex: aparecer a linha de log contendo "DATABASE IS READY TO USE!").

  Com o novo container, deve-se chamar o método
  `.withWaitStrategy(<estratégia>)` de acordo com a estratégia de espera de
  inicialização.

- Deve-se esperar um tempo razoável de acordo com o download da imagem Docker e
  sua inicialização (ex: 4 minutos).

  Com o novo, container, deve-se chamar o método
  `.withStartupTimeout(<tempo-em-milissegundos>)`

- Por fim, deve-se chamar o método `.start()` no final da cadeia de invocação de
  métodos. Esse método retorna uma Promise, que deverá ser esperada (await).

- Seu código de subida do container deverá estar de acordo com o exemplo abaixo:

  ```typescript
  beforeAll(async () => {
    container = await new GenericContainer("gvenzl/oracle-free:23.3-slim")
      .withEnvironment({
        ORACLE_RANDOM_PASSWORD: "yes",
        ORACLE_DATABASE: database,
        APP_USER: user,
        APP_USER_PASSWORD: password,
      })
      .withCopyDirectoriesToContainer([
        {
          source: path.resolve(process.cwd(), "scripts/sql"),
          target: "/container-entrypoint-initdb.d",
        },
      ])
      .withExposedPorts(port)
      .withWaitStrategy(Wait.forLogMessage("DATABASE IS READY TO USE!"))
      .withStartupTimeout(4 * MINUTES)
      .start();

    // ...
  });
  ```

#### Conexão com o banco através do Sequelize

Com o container rodando, deve-se sobrescrever o arquivo de ambiente
(`src/config/environment.ts`) com as variáveis necessárias de conexão com o
banco. É recomendado salvar os valores originais para restaurá-los depois da
execução do teste.

Deve-se obter o host e a porta do banco através dos métodos `.getHost()` e
`.getMapperPort()` do container iniciado usando Testcontainers.

Lembre-se de adicionar um tempo de timeout adequado para a etapa de `beforeAll`,
de acordo com o tempo de timeout usado para esperar a subida do container.

```typescript
beforeAll(async () => {
  // subida do container...

  host = container.getHost();
  mappedPort = container.getMappedPort(port);

  const oracleRelationalDB: IEnvironment["relationalDB"] = {
    dialect: "oracle",
    username: user,
    password,
    database,
    host,
    port: mappedPort,
  };

  originalRelationalDB = { ...environment.relationalDB };
  environment.relationalDB = oracleRelationalDB;

  sequelize = await DatabaseConfig.getConnection();
}, 240000); // 4 minutos
```

**Com isso, já pode-se invocar qualquer método do controller ou do model
desejado para operar com o banco de dados.**

#### Parada do container e desconexão com o banco de dados

Depois de executado os testes, deve-se desconectar-se do banco, parar o
container e restaurar as variáveis de ambiente, com os comandos exemplificados
abaixo. Lembre-se de adicionar um tempo de timeout adequado para esperar a
parada do container.

```typescript
afterAll(async () => {
  environment.relationalDB = originalRelationalDB;
  await sequelize.close();
  await container.stop();
}, 60000); // 1 minuto
```
