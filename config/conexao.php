<?php 
//TODO: Não esta funcionando a config.php não tá pegando as variaveis 
//require_once 'config.php';

define('DB_HOST', 'localhost');
define('DB_NAME', 'EntelPrice_ERP');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_PORT', 3306);

try {

    $pdo = new PDO(
        "mysql:host=" . DB_HOST .
        ";port=" . DB_PORT .
        ";dbname=" . DB_NAME .
        ";charset=utf8mb4",
        DB_USER,
        DB_PASS
    );

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Conectado com sucesso!";

    $GLOBALS['dbcon'] = $pdo;

} catch (PDOException $e) {

    echo "Houve algum erro na conexão ao banco de dados.";
    echo "Erro: " . $e->getMessage();

}