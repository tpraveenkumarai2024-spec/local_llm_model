"""
================================================================================
Advanced Local Open-Source LLM Chatbot - Flask Backend
================================================================================
Features:
- Real-Time Token Streaming (Server-Sent Events / SSE) with performance metrics
  (eval_count, eval_duration, tokens/second speed calculation)
- Multiple AI Personas (General, Code Architect, Technical Explainer, Concise)
- Temperature & Generation Options configuration
- Model Management (Listing & In-app Model Pulling)
- Standard (Non-streaming) fallback endpoint
- 100% Offline & Private (Localhost loopback only)
================================================================================
"""

import os
import sys
import json
import time
import requests
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

# Configure UTF-8 encoding for Windows console compatibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Initialize Flask application
app = Flask(__name__)

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
MAX_HISTORY_TURNS = 12

# Personas / System Prompts
PERSONAS = {
    "general": (
        "You are a helpful, respectful, and knowledgeable AI assistant running locally "
        "on the user's computer via Ollama. You provide clear, concise, and accurate explanations. "
        "When providing code, use markdown code blocks with language identifiers."
    ),
    "coder": (
        "You are an elite Senior Software Architect and master programmer. "
        "Provide elegant, robust, type-annotated, and well-commented code. "
        "Explain edge cases, time/space complexity, and best practices. "
        "Always format code inside markdown code blocks with language tags."
    ),
    "explainer": (
        "You are an inspiring technical educator and master explainer. "
        "Break down complex technical, scientific, or mathematical concepts using simple "
        "language, intuitive analogies, and clear step-by-step breakdowns (ELI5 approach)."
    ),
    "concise": (
        "You are an ultra-concise executive AI assistant. "
        "Give direct, high-density, accurate answers using bullet points. "
        "Eliminate all filler, pleasantries, and unnecessary fluff."
    ),
    "creative": (
        "You are a creative writer and storyteller with rich vocabulary, vivid descriptions, "
        "and captivating narrative skills."
    )
}


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
def build_messages_payload(raw_history, clean_message, persona_key="general"):
    """
    Constructs the message array for Ollama conforming to the Chat API schema.
    """
    system_prompt = PERSONAS.get(persona_key, PERSONAS["general"])
    messages = [{"role": "system", "content": system_prompt}]

    if isinstance(raw_history, list):
        max_messages = MAX_HISTORY_TURNS * 2
        recent_history = raw_history[-max_messages:]
        for entry in recent_history:
            if isinstance(entry, dict):
                role = entry.get("role")
                content = entry.get("content")
                if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                    messages.append({"role": role, "content": content.strip()})

    messages.append({"role": "user", "content": clean_message})
    return messages


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    """Renders the main advanced chatbot interface."""
    return render_template("index.html", default_model=DEFAULT_MODEL)


@app.route("/api/status", methods=["GET"])
def check_status():
    """Checks Ollama connection and retrieves downloaded models with details."""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if response.status_code == 200:
            data = response.json()
            raw_models = data.get("models", [])
            
            models = []
            for m in raw_models:
                models.append({
                    "name": m.get("name"),
                    "size": m.get("size", 0),
                    "modified_at": m.get("modified_at", ""),
                    "format": m.get("details", {}).get("format", ""),
                    "parameter_size": m.get("details", {}).get("parameter_size", ""),
                    "quantization_level": m.get("details", {}).get("quantization_level", "")
                })

            return jsonify({
                "status": "online",
                "message": "Ollama is running locally.",
                "models": models,
                "model_names": [m["name"] for m in models],
                "default_model": DEFAULT_MODEL,
                "ollama_url": OLLAMA_BASE_URL
            }), 200
        else:
            return jsonify({
                "status": "warning",
                "message": f"Ollama returned status {response.status_code}.",
                "models": [],
                "model_names": [],
                "default_model": DEFAULT_MODEL
            }), 200

    except requests.exceptions.ConnectionError:
        return jsonify({
            "status": "offline",
            "message": f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. Ensure Ollama is running.",
            "models": [],
            "model_names": [],
            "default_model": DEFAULT_MODEL,
            "ollama_url": OLLAMA_BASE_URL
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "models": [],
            "model_names": [],
            "default_model": DEFAULT_MODEL
        }), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """
    Advanced streaming endpoint returning Server-Sent Events (SSE).
    Streams tokens as they are generated with real-time tokens/sec telemetry.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON payload."}), 400

    user_message = data.get("message", "")
    if not isinstance(user_message, str) or not user_message.strip():
        return jsonify({"error": "Message cannot be empty."}), 400

    clean_message = user_message.strip()
    selected_model = data.get("model", "").strip() or DEFAULT_MODEL
    persona_key = data.get("persona", "general")
    temperature = float(data.get("temperature", 0.7))

    messages = build_messages_payload(data.get("history", []), clean_message, persona_key)

    ollama_payload = {
        "model": selected_model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": max(0.0, min(temperature, 1.5))
        }
    }

    def generate_sse():
        start_time = time.time()
        try:
            req = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=ollama_payload,
                stream=True,
                timeout=180
            )

            if req.status_code == 404:
                err_data = json.dumps({
                    "error": f"Model '{selected_model}' not found in local library. Pull it with 'ollama run {selected_model}'."
                })
                yield f"data: {err_data}\n\n"
                return

            if req.status_code != 200:
                err_data = json.dumps({
                    "error": f"Ollama error (HTTP {req.status_code}): {req.text}"
                })
                yield f"data: {err_data}\n\n"
                return

            accumulated_tokens = 0
            for line in req.iter_lines():
                if line:
                    chunk = json.loads(line)
                    is_done = chunk.get("done", False)
                    content = chunk.get("message", {}).get("content", "")
                    
                    if is_done:
                        eval_count = chunk.get("eval_count", accumulated_tokens)
                        eval_duration_ns = chunk.get("eval_duration", 0)
                        eval_duration_sec = (eval_duration_ns / 1e9) if eval_duration_ns else (time.time() - start_time)
                        tok_per_sec = (eval_count / eval_duration_sec) if eval_duration_sec > 0 else 0

                        event_data = {
                            "content": content,
                            "done": True,
                            "model": selected_model,
                            "stats": {
                                "eval_count": eval_count,
                                "eval_duration": round(eval_duration_sec, 2),
                                "tok_per_sec": round(tok_per_sec, 1),
                                "total_duration": round(time.time() - start_time, 2)
                            }
                        }
                    else:
                        accumulated_tokens += 1
                        event_data = {
                            "content": content,
                            "done": False,
                            "model": selected_model
                        }

                    yield f"data: {json.dumps(event_data)}\n\n"

        except requests.exceptions.ConnectionError:
            err_data = json.dumps({"error": "Lost connection to local Ollama service."})
            yield f"data: {err_data}\n\n"
        except Exception as e:
            err_data = json.dumps({"error": f"Streaming error: {str(e)}"})
            yield f"data: {err_data}\n\n"

    return Response(
        stream_with_context(generate_sse()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    """Standard non-streaming fallback endpoint."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid request."}), 400

    user_message = data.get("message", "")
    if not isinstance(user_message, str) or not user_message.strip():
        return jsonify({"error": "Message cannot be empty."}), 400

    clean_message = user_message.strip()
    selected_model = data.get("model", "").strip() or DEFAULT_MODEL
    persona_key = data.get("persona", "general")
    temperature = float(data.get("temperature", 0.7))

    messages = build_messages_payload(data.get("history", []), clean_message, persona_key)

    ollama_payload = {
        "model": selected_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": max(0.0, min(temperature, 1.5))}
    }

    try:
        start_time = time.time()
        res = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload, timeout=120)
        elapsed = round(time.time() - start_time, 2)

        if res.status_code == 200:
            result = res.json()
            content = result.get("message", {}).get("content", "")
            eval_count = result.get("eval_count", 0)
            eval_duration_sec = result.get("eval_duration", 0) / 1e9 or elapsed
            tok_per_sec = round(eval_count / eval_duration_sec, 1) if eval_duration_sec > 0 else 0

            return jsonify({
                "response": content,
                "model": selected_model,
                "stats": {
                    "eval_count": eval_count,
                    "eval_duration": round(eval_duration_sec, 2),
                    "tok_per_sec": tok_per_sec,
                    "total_duration": elapsed
                }
            }), 200
        elif res.status_code == 404:
            return jsonify({"error": f"Model '{selected_model}' not found in Ollama library."}), 404
        else:
            return jsonify({"error": f"Ollama error ({res.status_code}): {res.text}"}), res.status_code

    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Cannot connect to Ollama. Ensure Ollama is running."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/models/pull", methods=["POST"])
def pull_model():
    """Allows downloading a new model directly from the web interface."""
    data = request.get_json(silent=True) or {}
    model_name = data.get("name", "").strip()
    if not model_name:
        return jsonify({"error": "Model name is required."}), 400

    def generate_pull_sse():
        try:
            req = requests.post(
                f"{OLLAMA_BASE_URL}/api/pull",
                json={"name": model_name, "stream": True},
                stream=True,
                timeout=600
            )
            for line in req.iter_lines():
                if line:
                    yield f"data: {line.decode('utf-8')}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate_pull_sse()),
        mimetype="text/event-stream"
    )


@app.route("/api/clear", methods=["POST"])
def clear_session():
    """Acknowledge conversation reset."""
    return jsonify({"status": "success", "message": "Conversation history reset."}), 200


# -----------------------------------------------------------------------------
# Main Entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 65)
    print("[*] Starting Advanced Local Open-Source LLM Chatbot")
    print(f"[*] Target Ollama Service : {OLLAMA_BASE_URL}")
    print(f"[*] Configured Default Model: {DEFAULT_MODEL}")
    print("[*] Privacy Notice         : 100% Localhost Only (No external APIs)")
    print("[*] Web Application URL   : http://127.0.0.1:5000")
    print("=" * 65)
    print("Press CTRL+C in this terminal window to stop the server.\n")

    app.run(host="127.0.0.1", port=5000, debug=True)
