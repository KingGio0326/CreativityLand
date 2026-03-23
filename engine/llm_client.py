import os

from openai import OpenAI


def get_llm_client() -> OpenAI:
    """
    Ritorna un client OpenAI configurato per OpenRouter.
    Fallback su Anthropic diretto se OPENROUTER_API_KEY non presente.
    """
    openrouter_key = os.getenv('OPENROUTER_API_KEY')

    if openrouter_key:
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=openrouter_key,
            default_headers={
                "HTTP-Referer": "https://creativity-land.vercel.app",
                "X-Title": "TradingBot CreativityLand",
            },
        )
    else:
        raise ValueError(
            "OPENROUTER_API_KEY non trovata. "
            "Aggiungila come secret GitHub o nel file .env"
        )


DEFAULT_MODEL = "google/gemini-flash-2.0"
FALLBACK_MODEL = "meta-llama/llama-3.3-70b-instruct"


def call_llm(
    prompt: str,
    system: str = "",
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1000,
    temperature: float = 0.3,
) -> str:
    """
    Chiamata LLM unificata via OpenRouter.
    Ritorna il testo della risposta o stringa vuota in caso di errore.
    """
    client = get_llm_client()

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"LLM error ({model}): {e}")
        if model != FALLBACK_MODEL:
            print(f"Retry con fallback model: {FALLBACK_MODEL}")
            try:
                response = client.chat.completions.create(
                    model=FALLBACK_MODEL,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                return response.choices[0].message.content or ""
            except Exception as e2:
                print(f"Fallback error: {e2}")
        return ""


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    result = call_llm(
        prompt="Analizza brevemente il contesto macro attuale per AAPL in 3 bullet points.",
        system="Sei un analista finanziario esperto.",
    )
    print("Test risposta:")
    print(result)
