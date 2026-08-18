<?php 

require_once 'config.php';

define('DB_HOST', $db_host);
define('DB_NAME', $db_name);
define('DB_USER', $db_user);
define('DB_PASS', $db_pass);
define('DB_PORT', $db_port);

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