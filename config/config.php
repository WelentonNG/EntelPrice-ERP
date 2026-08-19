<?php

$envChoice = $_SESSION['environment'] ?? 'PROD';
$envPath = __DIR__ . '/.env';

if (!file_exists($envPath)) {
    die("Arquivo .env não encontrado em $envPath");
}

$lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

if ($lines === false) {
    die("Erro ao ler o arquivo .env");
}

foreach ($lines as $line) {

    if (empty(trim($line)) || strpos(trim($line), '#') === 0) {
        continue;
    }

    if (strpos($line, '=') === false) {
        continue;
    }

    list($name, $value) = explode('=', $line, 2);

    putenv(sprintf('%s=%s', trim($name), trim($value)));
}

if ($envChoice == 'PROD') {

    $host = getenv('DB_HOST');
    $user = getenv('DB_USER');
    $pwd = getenv('DB_PASS');
    $database = getenv('DB_DATABASE');

    $current_env = 'PROD';

}else{};
// TRANSFORMA TODAS AS VARIÁVEIS ACIMA EM GLOBAIS
$GLOBALS = array_merge($GLOBALS, get_defined_vars());

