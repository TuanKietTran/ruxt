//! HTTP transport: base URL, cookie jar, and the server's error shapes.
//!
//! Auth is the server cookie session (`auth_session`, 7 days): the client
//! keeps a cookie jar, sends no Bearer token, and treats 401 as signed out.
//! Identity is always derived from that session by the server.

use serde::de::DeserializeOwned;
use serde::Serialize;

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("http {status}: {message}")]
    Http {
        status: u16,
        code: Option<String>,
        message: String,
    },
    #[error("transport: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("invalid base url: {0}")]
    InvalidUrl(#[from] url::ParseError),
}

impl ApiError {
    pub fn status(&self) -> Option<u16> {
        match self {
            ApiError::Http { status, .. } => Some(*status),
            ApiError::Transport(err) => err.status().map(|s| s.as_u16()),
            ApiError::InvalidUrl(_) => None,
        }
    }

    pub fn is_unauthorized(&self) -> bool {
        self.status() == Some(401)
    }
}

#[derive(Clone)]
pub struct ApiClient {
    base: String,
    http: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: &str) -> ApiResult<Self> {
        let parsed = url::Url::parse(base_url)?;
        let http = reqwest::Client::builder().cookie_store(true).build()?;
        Ok(Self {
            base: parsed.as_str().trim_end_matches('/').to_string(),
            http,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    fn url_for(&self, path: &str) -> String {
        format!("{}{}", self.base, path)
    }

    async fn finish<T: DeserializeOwned>(&self, response: reqwest::Response) -> ApiResult<T> {
        let status = response.status();
        if status.is_success() {
            return Ok(response.json::<T>().await?);
        }
        let body = response.text().await.unwrap_or_default();
        let value: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
        let message = value
            .get("statusMessage")
            .or_else(|| value.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("request failed")
            .to_string();
        let code = value
            .get("data")
            .and_then(|d| d.get("code"))
            .and_then(|c| c.as_str())
            .map(str::to_string);
        Err(ApiError::Http {
            status: status.as_u16(),
            code,
            message,
        })
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> ApiResult<T> {
        let response = self.http.get(self.url_for(path)).send().await?;
        self.finish(response).await
    }

    pub async fn post_json<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> ApiResult<T> {
        let response = self.http.post(self.url_for(path)).json(body).send().await?;
        self.finish(response).await
    }

    pub async fn put_json<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> ApiResult<T> {
        let response = self.http.put(self.url_for(path)).json(body).send().await?;
        self.finish(response).await
    }

    pub async fn post_empty<T: DeserializeOwned>(&self, path: &str) -> ApiResult<T> {
        let response = self.http.post(self.url_for(path)).send().await?;
        self.finish(response).await
    }

    pub async fn get_bytes(&self, path: &str) -> ApiResult<Vec<u8>> {
        let response = self.http.get(self.url_for(path)).send().await?;
        let status = response.status();
        if status.is_success() {
            return Ok(response.bytes().await?.to_vec());
        }
        let body = response.text().await.unwrap_or_default();
        let value: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
        let message = value
            .get("statusMessage")
            .and_then(|v| v.as_str())
            .unwrap_or("request failed")
            .to_string();
        Err(ApiError::Http {
            status: status.as_u16(),
            code: None,
            message,
        })
    }

    pub async fn post_multipart<T: DeserializeOwned>(
        &self,
        path: &str,
        form: reqwest::multipart::Form,
        idempotency_key: Option<&str>,
    ) -> ApiResult<T> {
        let mut request = self.http.post(self.url_for(path)).multipart(form);
        if let Some(key) = idempotency_key {
            request = request.header("idempotency-key", key);
        }
        let response = request.send().await?;
        self.finish(response).await
    }
}

/// Percent-encode one path segment (server-issued ids are already safe;
/// this keeps arbitrary ids from breaking the path structure).
pub(crate) fn encode_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
