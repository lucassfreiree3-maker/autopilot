#!/bin/bash
set -e

function displayHelp() {
    print_title "SCRIPT DE EXECUÇÃO DA APLICAÇÃO"
cat <<EOF | fold -sw "$COLS"

Uso:  ./run/run.sh [OPÇÕES]

Opções:

  -c, --curio                Executa apenas curió, sem subir a aplicação
  -d, --database             Executa apenas banco de dados, sem subir a aplicação
  -f, --force                MODO forçado, ignora a configuração e validação do Node.js
  -h, --help                 Exibe esta tela de ajuda


Script de execução da aplicação, com a(s) seguinte(s) possibilidade(s) de execução:

    1. Completo (full): modo executado por padrão (sem flags), quando não se informa nenhum modo de execução. A aplicação será executada por completo. Serão executados a aplicação, o banco de dados e o curió.


EOF
    printHelp
    print_line
    exit 0;
}

COLS=$(tput cols)

function print_line() {
  printf "%${COLS}s\n" | tr ' ' '-'
}

function print_title() {
  printf "\n"
  print_line
  echo -e "\033[1m $1 \033[0m"
  print_line
  printf "\n"
}

function textoAlerta() {
  printf "%b" "\e[1;33m"
  printf '%s\n' "$1"
  printf "\e[0m"
}

function textoErro() {
  printf "%b" "\e[1;31m"
  printf '%s\n' "$1"
  printf "\e[0m"
}

function printHelp() {
  printf "\nCaso tenha dúvidas, erros ou sugestões, abra uma issue no link abaixo:\n"
  textoAlerta "https://fontes.intranet.bb.com.br/dev/publico/developer-stacks/-/issues"
}


function startDockerComposeFull() {
    print_title "MODO FULL"

    npm install
    npm rebuild ibm_db --update-binary
    npm run build
    printf "\n"

    docker-compose -f "./run/docker-compose.yml" up --build
}

function startDockerComposeCurio() {
    print_title "MODO CURIO"

    docker-compose -f "./run/docker-compose-curio.yml" up
}

function startDockerComposeDataBase() {
    print_title "MODO DATABASE"

    docker-compose -f "./run/docker-compose-database.yml" up
}

function startDockerComposeInfraOnly() {
    print_title "MODO INFRA-ONLY"

    docker-compose -f "./run/docker-compose-curio.yml" -f "./run/docker-compose-database.yml" up
}

function startDockerCompose() {
    DOCKER_COMPOSE_MODE=$1

    stopExistingContainers "${DOCKER_COMPOSE_MODE}"

    print_title "REALIZANDO O BUILD DA APLICAÇÃO"

    print_title "INICIANDO O DOCKER COMPOSE"

    if [[ ${DOCKER_COMPOSE_MODE} == "full" ]]; then
        startDockerComposeFull
    elif [[ ${DOCKER_COMPOSE_MODE} == "curio" ]]; then
        startDockerComposeCurio
    elif [[ ${DOCKER_COMPOSE_MODE} == "database" ]]; then
        startDockerComposeDataBase
    elif [[ ${DOCKER_COMPOSE_MODE} == "infraonly" ]]; then
        startDockerComposeInfraOnly
    else
        textoErro "Modo inválido de execução!"
        exit 1
    fi
}

verificarConfig() {
    local versao_instalada=$(node -v | cut -d "v" -f 2)
    local versao_minima=18

    if [ "$(printf '%s\n' "$versao_minima" "$versao_instalada" | sort -V | head -n1)" != "$versao_minima" ]; then
        textoErro "Você precisa usar o Node.js versão 18 ou superior."
        exit 1
    fi
}

function stopExistingContainers() {
    DOCKER_COMPOSE_MODE=$1

    print_title "INTERROMPENDO EXECUÇÃO ATIVA"

    textoAlerta "Para saber sobre as opções de execução, execute script com -h, ex: ./run/run.sh -h"
    printHelp
    printf "\n"

    if [[ ${DOCKER_COMPOSE_MODE} == "full" ]]; then
        docker-compose -f "./run/docker-compose.yml" down

    
    
    
    else
        textoErro "Modo inválido de execução!"
    fi

    printf "\n"
}

function main() {
    export MY_UID="$(id -u)"
    export MY_GID="$(id -g)"

    DOCKER_COMPOSE_MODE="full"
    SHOULD_DISPLAY_HELP=false
    VERIFICAR_CONFIG=true

    while [ $# -gt 0 ]
    do
        case $1 in
        
        
        
        -f | --force)
            VERIFICAR_CONFIG=false
            shift
            ;;

        -h | --help)
            SHOULD_DISPLAY_HELP=true
            shift
            ;;
        *)
            echo "Opção $1 inválida!"
            exit 1
            ;;
        esac
    done

    if [ "$VERIFICAR_CONFIG" = true ]; then
        verificarConfig
    fi

    if [[ ${SHOULD_DISPLAY_HELP} == true ]]; then
        displayHelp
    fi

    trap "stopExistingContainers ${DOCKER_COMPOSE_MODE}" INT TERM

    startDockerCompose ${DOCKER_COMPOSE_MODE}
}

main $@
