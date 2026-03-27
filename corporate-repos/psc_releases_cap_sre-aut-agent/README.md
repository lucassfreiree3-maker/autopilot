# Documentação Capability sre-aut-agent

Categorização da Capability:
 
- Essencial
  - [ ] Sim
  - [X] Não
- Criticidade
  - [X] Baixa
  - [ ] Média
  - [ ] Alta
- Tipo
  - [x] Deploy
    - [ ] Com Nodes
  - [ ] Nodes

## ROTEIRO PARA DEPLOY DA CAPABILITY

Esta capability será utilizada deploy dos artefatos necessários para atuação sre-aut-agent em clusters na BB Cloud.

Para utilização da capability, siga os passos abaixo:

### 1 - Incluir a capability no arquivo de metadados do cluster.

O arquivo de metadados do cluster está no repositório git psc_releases_k8s-cluster-metadata > 20-releases > cluster-metadata > releases.
Dentro desse diretório, escolher o diretório relativo ao ambiente do cluster (des, hml, prd) e editar o arquivo de metadados com o nome do cluster para incluir a capability, conforme exemplo abaixo:

> abaixo de capabilities, incluir o nome da capability, informando a versão e os parâmetros necessários para sua configuração.

Openshift:

```
capabilities:
  sre-aut-agent:
    config:
      enabled: "true"
      deploy: "true"
      nodes: "false"
      releaseVersion: "v1"
      pipeline: "v2-2"
    data: {}
    dependsOn: []
```


### 2 - Links Úteis

---
- [AppSet Base](https://infra-util-gitops.deploy.nuvem.bb.com.br/applications/k8s-aplic-appset-v2-2)
  - [AppSet Des](https://infra-util-gitops.deploy.nuvem.bb.com.br/applications/psc-argocd-infra-util/psc-sre-aut-agent-des-v2-2)
  - [AppSet Hml](https://infra-util-gitops.deploy.nuvem.bb.com.br/applications/psc-argocd-infra-util/psc-sre-aut-agent-hml-v2-2)
  - [AppSet Prd](https://infra-util-gitops.deploy.nuvem.bb.com.br/applications/psc-argocd-infra-util/psc-sre-aut-agent-prd-v2-2)
- Applications:
  - [Argo infra-util-gitops](https://infra-util-gitops.deploy.nuvem.bb.com.br/applications)
    - NOME_CLUSTER-psc-sre-aut-agent-appset-v2-2 (AppSet Intermediário)
   

---
- [Documentação](https://fontes.intranet.bb.com.br/psc/interno/-/blob/master/roteiros/capabilities/capabilities-home.md) de Apoio
