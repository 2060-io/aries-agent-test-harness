use rand::{thread_rng, Rng};
use aries_vcx_agent::{Agent as AriesAgent, InitConfig};
use std::io::prelude::*;

#[derive(Debug, Deserialize)]
struct SeedResponse {
    seed: String,
}

async fn get_trustee_seed() -> String {
    if let Ok(ledger_url) = std::env::var("LEDGER_URL") {
        let url = format!("{}/register", ledger_url);
        let mut rng = thread_rng();
        let client = reqwest::Client::new();
        let body = json!({
            "role": "TRUST_ANCHOR",
            "seed": format!("my_seed_000000000000000000{}", rng.gen_range(100000, 1000000))
        })
        .to_string();
        client
            .post(&url)
            .body(body)
            .send()
            .await
            .expect("Failed to send message")
            .json::<SeedResponse>()
            .await
            .expect("Failed to deserialize response")
            .seed
    } else {
        "000000000000000000000000Trustee1".to_string()
    }
}

async fn download_genesis_file() -> std::result::Result<String, String> {
    match std::env::var("GENESIS_FILE").ok() {
        Some(genesis_file) => {
            if !std::path::Path::new(&genesis_file).exists() {
                Err(format!("The file {} does not exist", genesis_file))
            } else {
                info!("Using genesis file {}", genesis_file);
                Ok(genesis_file)
            }
        }
        None => match std::env::var("LEDGER_URL").ok() {
            Some(ledger_url) => {
                info!("Downloading genesis file from {}", ledger_url);
                let genesis_url = format!("{}/genesis", ledger_url);
                let body = reqwest::get(&genesis_url)
                    .await
                    .expect("Failed to get genesis file from ledger")
                    .text()
                    .await
                    .expect("Failed to get the response text");
                let path = std::env::current_dir()
                    .expect("Failed to obtain the current directory path")
                    .join("resource")
                    .join("genesis_file.txn");
                info!("Storing genesis file to {:?}", path);
                let mut f = std::fs::OpenOptions::new()
                    .write(true)
                    .create(true)
                    .open(path.clone())
                    .expect("Unable to open file");
                f.write_all(body.as_bytes()).expect("Unable to write data");
                debug!("Genesis file downloaded and saved to {:?}", path);
                path.to_str()
                    .map(|s| s.to_string())
                    .ok_or("Failed to convert genesis file path to string".to_string())
            }
            None => std::env::current_dir()
                .expect("Failed to obtain the current directory path")
                .join("resource")
                .join("indypool.txn")
                .to_str()
                .map(|s| s.to_string())
                .ok_or("Failed to convert genesis file path to string".to_string()),
        },
    }
}

pub async fn initialize() -> AriesAgent {
    let enterprise_seed = get_trustee_seed().await;
    let genesis_path = download_genesis_file()
        .await
        .expect("Failed to download the genesis file");
    let agency_endpoint =
        std::env::var("CLOUD_AGENCY_URL").unwrap_or("http://localhost:8080".to_string());
    let init_config = InitConfig {
        enterprise_seed,
        genesis_path,
        pool_name: "pool_name".to_string(),
        agency_endpoint,
        agency_did: "VsKV7grR1BUE29mG2Fm2kX".to_string(),
        agency_verkey: "Hezce2UWMZ3wUhVkh2LfKSs8nDzWwzs2Win7EzNN3YaR".to_string(),
        wallet_name: "wallet_name".to_string(),
        wallet_key: "8dvfYSt5d1taSd6yJdpjq4emkwsPDDLYxkNFysFD2cZY".to_string(),
        wallet_kdf: "RAW".to_string()
    };
    AriesAgent::initialize(init_config).await.unwrap()
}

pub fn shutdown() {}
