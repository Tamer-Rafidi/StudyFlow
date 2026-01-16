import requests
from typing import List, Dict

OPENAI_API_KEY = ""  

# Ollama Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_SUMMARY_MODEL = "llama3.2:3b"
OLLAMA_FLASHCARD_MODEL = "llama3.2:3b"


class OllamaService:
    """Service for interacting with local Ollama models"""

    def __init__(self, base_url: str = OLLAMA_BASE_URL):
        self.base_url = base_url
        self.summary_model = OLLAMA_SUMMARY_MODEL
        self.flashcard_model = OLLAMA_FLASHCARD_MODEL
        self.provider = "ollama"

    def _generate(self, model: str, prompt: str, system_prompt: str = "") -> str:
        """Call Ollama API"""
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                }
            }

            if system_prompt:
                payload["system"] = system_prompt

            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=300
            )
            response.raise_for_status()

            result = response.json()
            return result.get("response", "").strip()

        except requests.exceptions.RequestException as e:
            raise Exception(f"Ollama API error: {str(e)}")

    def is_available(self) -> bool:
        """Check if Ollama is running"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False

    def list_models(self) -> List[str]:
        """Get list of available models"""
        try:
            response = requests.get(f"{self.base_url}/api/tags")
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        except:
            return []


class OpenAIService:
    """Service for interacting with OpenAI API with dynamic model selection"""

    def __init__(self, api_key: str, model: str):
        if not api_key or api_key == "placeholder":
            raise Exception("OpenAI API key not set! Set OPENAI_API_KEY in settings.")

        self.api_key = api_key
        self.summary_model = model
        self.flashcard_model = model
        self.provider = "openai"
        self.selected_model = model

        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=api_key)
        except ImportError:
            raise Exception("OpenAI library not installed. Run: pip install openai")

    def _generate(self, model: str, prompt: str, system_prompt: str = "") -> str:
        """Call OpenAI API"""
        try:
            messages = []

            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            messages.append({"role": "user", "content": prompt})

            # Build base kwargs
            request_kwargs = {
                "model": model,
                "messages": messages,
            }

            if model.startswith("gpt-5"):
                request_kwargs["max_completion_tokens"] = 2000

                pass  

            else:
                request_kwargs["temperature"] = 0.7
                request_kwargs["max_tokens"] = 2000

            response = self.client.chat.completions.create(**request_kwargs)

            return response.choices[0].message.content.strip()

        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    def is_available(self) -> bool:
        """Check if OpenAI API key is valid"""
        try:
            self.client.models.list()
            return True
        except:
            return False

    def list_models(self) -> List[str]:
        """Get list of available models"""
        try:
            models = self.client.models.list()
            return [model.id for model in models.data if 'gpt' in model.id]
        except:
            return []

def get_ai_service_for_request(ai_model: str, openai_model: str = "gpt-4o-mini", api_key: str = ""):
    """
    Get AI service based on request header
    
    Args:
        ai_model: "openai" or "llama" (from X-AI-Model header)
        openai_model: Specific OpenAI model to use (from X-OpenAI-Model header)
        api_key: OpenAI API key (from X-OpenAI-API-Key header)
    
    Returns:
        OllamaService or OpenAIService instance
    """
    # Normalize the model preference
    ai_model_lower = ai_model.lower().strip() if ai_model else "openai"
    
    print(f"AI Service Request:")
    print(f" - Provider: {ai_model_lower}")
    print(f" - OpenAI Model: {openai_model}")
    print(f" - Has API Key: {bool(api_key and len(api_key) > 10)}")
    
    # Check if user wants to use Llama/Ollama
    if ai_model_lower in ["llama", "ollama"]:
        ollama_service = OllamaService()
        
        # Check if Ollama is actually available
        if not ollama_service.is_available():
            print(f"Warning: Ollama is not running! Please start Ollama.")
            raise Exception(
                "Ollama is not running. Please start Ollama with: ollama serve\n"
                "Or switch to OpenAI in settings."
            )
        
        return ollama_service
    
    # Otherwise, use OpenAI
    else:
        print(f" Using OpenAI ({openai_model}) for this request")
        
        # Validate API key
        if not api_key or len(api_key) < 20:
            print(f" Invalid or missing OpenAI API key")
            raise Exception(
                "OpenAI API key is missing or invalid.\n\n"
                "Please:\n"
                "1. Go to Settings\n"
                "2. Enter your OpenAI API key\n"
                "3. Or switch to 'Llama (Local)' if you have Ollama installed"
            )
        
        # Check if key looks valid (starts with sk-)
        if not (api_key.startswith('sk-') or api_key.startswith('sk-proj-')):
            print(f" API key format is invalid")
            raise Exception(
                "OpenAI API key format is invalid.\n\n"
                "API keys should start with 'sk-' or 'sk-proj-'\n"
                "Please check your API key in Settings."
            )
        
        try:
            return OpenAIService(api_key=api_key, model=openai_model)
        except Exception as e:
            error_msg = str(e)
            print(f" OpenAI service creation failed: {error_msg}")
            
            if "API key" in error_msg:
                raise Exception(
                    "Failed to initialize OpenAI service.\n\n"
                    "Please check:\n"
                    "1. Your API key is correct\n"
                    "2. Your API key is active\n"
                    "3. You have credits available\n\n"
                    f"Error: {error_msg}"
                )
            else:
                raise Exception(f"OpenAI initialization error: {error_msg}")


# Default service for backward compatibility
ai_service = OllamaService()  

# ============================================================================
# Main AI Functions (work with both providers)
# ============================================================================

def summarize_text(text: str, max_length: str = "detailed", service = None) -> str:
    """
    Generate a summary of lecture notes

    Args:
        text: The text to summarize
        max_length: "short" (3-5 bullets), "medium" (1-2 paragraphs), "detailed" (comprehensive)
        service: AI service instance (if None, uses default)

    Returns:
        Summary text
    """
    if service is None:
        service = ai_service
    
    length_instructions = {
        "short": """
    Create a concise summary in 3–5 bullet points that capture only the main textual ideas and themes.
    Do NOT reference any figures, diagrams, tables, or code snippets.
    Focus on the overarching concepts and key takeaways that can be understood from text alone.
    """,

        "medium": """
    Write a well-structured summary of 2–3 paragraphs.
    Cover the main concepts, definitions, and relationships between ideas, using clear academic language.
    Ignore any visuals, diagrams, or code segments – base your explanation only on the text.
    The goal is to help a student recall and understand the key points efficiently.
    """,

        "detailed": """
    Create a comprehensive, detailed summary suitable for in-depth studying.
    Include:
    - All major textual concepts and ideas
    - Key definitions, terminology, and relationships between topics
    - Examples and explanations that can be understood from text alone
    - Important steps, processes, or reasoning described in the material
    - Context and supporting information that aid understanding

    Do NOT include or refer to any images, diagrams, tables, or code snippets.
    Organize the summary into clearly labeled sections or well-structured paragraphs.
    Ensure a student could learn the material fully from your summary without needing the original notes.
    """
    }

    instruction = length_instructions.get(max_length, length_instructions["detailed"])
    avoid_visual_instruction = """
    Important: The material may contain figures, tables, or code snippets that are not accessible to the student.
    Do NOT reference or depend on such elements. Summarize only the text-based concepts.
    """
    system_prompt = """
    You are an expert educational assistant who creates clear, accurate, and structured summaries of study material.

    Guidelines:
    - Summarize only from the text. Ignore or skip any content describing images, figures, charts, or code snippets.
    - Never reference visuals or code (e.g., "as shown in the figure" or "in the code example").
    - Focus on the core ideas, relationships between concepts, definitions, and explanations.
    - Preserve important details, terminology, and examples that can be understood from text alone.
    - Organize the summary logically with headings, bullet points, or paragraphs for readability.
    - Use a professional and accessible tone suitable for academic study.
    - The summary should be comprehensive enough that a student could understand the material without seeing the original document.
    """

    prompt = f"""{instruction}

Lecture Notes:
{text}

Detailed Summary:"""
    system_prompt += avoid_visual_instruction
    
    try:
        summary = service._generate(service.summary_model, prompt, system_prompt)
        return summary

    except Exception as e:
        raise Exception(f"Error generating summary: {str(e)}")

def generate_flashcards(text: str, cards_per_difficulty: int = 5, service=None) -> List[Dict[str, str]]:
    """
    Generate flashcards from lecture notes at multiple difficulty levels.

    Args:
        text: The text to create flashcards from
        cards_per_difficulty: Number of flashcards per difficulty level
        service: AI service instance (if None, uses default)

    Returns:
        List of unique flashcard dictionaries in the format:
        [
            {"question": "What is X?", "answer": "X is ...", "difficulty": "easy"},
            ...
        ]
    """
    if service is None:
        service = ai_service

    # ---- Base system prompt ----
    system_prompt = """
    You are an expert educational assistant creating flashcards to help students study effectively.

    Guidelines:
    - Base all flashcards only on the textual content provided.
    - Ignore or skip any content describing code, images, figures, or tables.
    - Do NOT reference visuals (e.g., "as shown in the diagram" or "in the code example").
    - Make each question clear, specific, and self-contained.
    - Keep answers concise but complete – they should fully answer the question without unnecessary detail.
    - Ensure all flashcards are phrased in a way that helps students recall and understand the concept directly from text.
    - Avoid trick questions, ambiguity, or redundancy.
    - Each flashcard should be unique and test a distinct concept.
    """

    # ---- Difficulty-specific instructions ----
    difficulties = {
        "easy": """
    Focus on fundamental definitions, terms, and straightforward recall questions.
    Test essential factual knowledge that can be directly stated from the text.
    Avoid visuals or code-related content.
    """,

            "medium": """
    Focus on conceptual understanding and reasoning.
    Include "why" or "how" questions that connect multiple ideas or describe relationships.
    Answers should show comprehension, not just memorization.
    Ignore diagrams, code snippets, or visuals.
    """,

            "hard": """
    Focus on application, synthesis, and higher-order thinking.
    Create questions that require combining multiple textual concepts, applying theories, or reasoning about implications.
    Avoid visuals, figures, or code references.
    Answers should be brief but demonstrate analytical or integrative understanding.
    """
    }

    # ---- Generate flashcards for each difficulty ----
    all_flashcards = []
    seen_questions = set()

    for difficulty, instruction in difficulties.items():
        print(f"Generating {cards_per_difficulty} {difficulty} flashcards...")

        prompt = f"""
        Create exactly {cards_per_difficulty} {difficulty.upper()} difficulty flashcards from these lecture notes.
        {instruction}

        Format each flashcard EXACTLY like this:
        Q: [Clear, specific question]
        A: [Concise, accurate answer]

        Leave one blank line between flashcards.

        Lecture Notes:
        {text}

        {difficulty.upper()} Flashcards:
        """

        try:
            response = service._generate(service.flashcard_model, prompt, system_prompt)
            flashcards = _parse_flashcards(response)

            for card in flashcards:
                card['difficulty'] = difficulty

            flashcards = flashcards[:cards_per_difficulty]
            all_flashcards.extend(flashcards)

            if len(flashcards) < cards_per_difficulty:
                print(f"Only generated {len(flashcards)} {difficulty} cards")
            else:
                print(f"Generated {len(flashcards)} {difficulty} cards")

        except Exception as e:
            print(f"Error generating {difficulty} cards: {e}")

    return all_flashcards


def _parse_flashcards(text: str) -> List[Dict[str, str]]:
    """Parse flashcard text into structured format"""
    import re

    flashcards = []
    sections = re.split(r'\n\s*Q:\s*', text)

    for section in sections[1:]:
        parts = re.split(r'\n\s*A:\s*', section, maxsplit=1)

        if len(parts) == 2:
            question = parts[0].strip()
            answer = re.split(r'\n\s*Q:\s*', parts[1])[0].strip()

            if question and answer:
                flashcards.append({
                    "question": question,
                    "answer": answer
                })

    return flashcards
