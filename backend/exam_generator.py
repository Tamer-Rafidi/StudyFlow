from typing import List, Dict
from ai_service import ai_service
import re


def generate_multiple_choice(text: str, num_questions: int = 10) -> List[Dict]:
    """
    Generate multiple choice questions from text

    Args:
        text: Source text for questions
        num_questions: Number of questions to generate

    Returns:
        List of multiple choice questions with answers
    """
    avoid_visual_instruction = """
    Important: The input material may contain figures, tables, or code snippets that are not visible to the student.
    Do NOT create any question that depends on such visual or code-based content.
    If necessary, skip those parts and focus only on explainable text concepts.
    """
    system_prompt = """
    You are an expert educational content creator generating true/false questions for students.

    Guidelines:
    - Use only textual content. Ignore diagrams, figures, tables, or code snippets.
    - Each statement should be conceptually rich and test understanding, not trivial facts.
    - Avoid obvious cues like "always", "never", or "all of the above".
    - Make false statements subtly incorrect — they should require comprehension to detect.
    - Do not refer to visuals (e.g., “according to the chart” or “in the code shown”).
    - Keep statements concise, factual, and unambiguous.
    """


    prompt = f"""Create exactly {num_questions} multiple choice questions from this material.

Format EXACTLY like this for each question:
Q: [Clear question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [Letter of correct answer]
EXPLANATION: [Brief explanation why this is correct]

Leave one blank line between questions.

Study Material:
{text}

Multiple Choice Questions:"""
    system_prompt += avoid_visual_instruction
    try:
        response = ai_service._generate(
            ai_service.summary_model if hasattr(ai_service, 'summary_model') else ai_service.flashcard_model,
            prompt,
            system_prompt
        )

        questions = _parse_multiple_choice(response)
        return questions[:num_questions]

    except Exception as e:
        print(f" Error generating multiple choice: {e}")
        return []


def generate_true_false(text: str, num_questions: int = 10) -> List[Dict]:
    """
    Generate true/false questions from text

    Args:
        text: Source text for questions
        num_questions: Number of questions to generate

    Returns:
        List of true/false questions with answers
    """

    avoid_visual_instruction = """
    Important: The input material may contain figures, tables, or code snippets that are not visible to the student.
    Do NOT create any question that depends on such visual or code-based content.
    If necessary, skip those parts and focus only on explainable text concepts.
    """

    system_prompt = """
    You are an expert educational content creator generating true/false questions for students.

    Guidelines:
    - Use only textual content. Ignore diagrams, figures, tables, or code snippets.
    - Each statement should be conceptually rich and test understanding, not trivial facts.
    - Avoid obvious cues like "always", "never", or "all of the above".
    - Make false statements subtly incorrect — they should require comprehension to detect.
    - Do not refer to visuals (e.g., “according to the chart” or “in the code shown”).
    - Keep statements concise, factual, and unambiguous.
    """

    prompt = f"""Create exactly {num_questions} true/false questions from this material.

Format EXACTLY like this for each question:
Q: [Statement to evaluate]
ANSWER: [TRUE or FALSE]
EXPLANATION: [Brief explanation]

Leave one blank line between questions.

Study Material:
{text}

True/False Questions:"""
    system_prompt += avoid_visual_instruction
    try:
        response = ai_service._generate(
            ai_service.summary_model if hasattr(ai_service, 'summary_model') else ai_service.flashcard_model,
            prompt,
            system_prompt
        )

        questions = _parse_true_false(response)
        return questions[:num_questions]

    except Exception as e:
        print(f" Error generating true/false: {e}")
        return []


def generate_short_answer(text: str, num_questions: int = 10) -> List[Dict]:
    """
    Generate short answer questions from text

    Args:
        text: Source text for questions
        num_questions: Number of questions to generate

    Returns:
        List of short answer questions with sample answers
    """

    avoid_visual_instruction = """
    Important: The input material may contain figures, tables, or code snippets that are not visible to the student.
    Do NOT create any question that depends on such visual or code-based content.
    If necessary, skip those parts and focus only on explainable text concepts.
    """

    system_prompt = """
    You are an expert educator creating short answer questions for students.

    Guidelines:
    - Use only textual content. Ignore or skip any sections describing images, code, or diagrams.
    - Each question should require 2–4 sentence responses demonstrating reasoning, explanation, or conceptual understanding.
    - Avoid factual recall questions; focus on application, comparison, or explanation.
    - Do not refer to visuals or code (e.g., “in the figure” or “what does this code do”).
    - Provide a well-written SAMPLE_ANSWER and KEY_POINTS that show what an ideal response includes.
    - Use clear, academic, and accessible language suitable for exams.
    """

    prompt = f"""Create exactly {num_questions} short answer questions from this material.

Format EXACTLY like this for each question:
Q: [Question requiring 2-4 sentence answer]
SAMPLE_ANSWER: [Example of a good answer]
KEY_POINTS: [Main points that should be included]

Leave one blank line between questions.

Study Material:
{text}

Short Answer Questions:"""
    system_prompt += avoid_visual_instruction
    try:
        response = ai_service._generate(
            ai_service.summary_model if hasattr(ai_service, 'summary_model') else ai_service.flashcard_model,
            prompt,
            system_prompt
        )

        questions = _parse_short_answer(response)
        return questions[:num_questions]

    except Exception as e:
        print(f" Error generating short answer: {e}")
        return []


def generate_mixed_exam(text: str, total_questions: int = 30) -> List[Dict]:
    """
    Generate a mixed exam with different question types

    Args:
        text: Source text for questions
        total_questions: Total number of questions

    Returns:
        List of mixed question types
    """
    
    mc_count = int(total_questions * 0.5)
    tf_count = int(total_questions * 0.3)
    sa_count = total_questions - mc_count - tf_count

    print(f"   Generating {mc_count} multiple choice questions...")
    mc_questions = generate_multiple_choice(text, mc_count)

    print(f"  ✓✗ Generating {tf_count} true/false questions...")
    tf_questions = generate_true_false(text, tf_count)

    print(f"   Generating {sa_count} short answer questions...")
    sa_questions = generate_short_answer(text, sa_count)

    all_questions = mc_questions + tf_questions + sa_questions

    return all_questions


def _parse_multiple_choice(text: str) -> List[Dict]:
    """Parse multiple choice questions from AI response"""
    questions = []

    sections = re.split(r'\n\s*Q:\s*', text)

    for section in sections[1:]:
        try:
            lines = section.strip().split('\n')
            question_text = lines[0].strip()

            options = {}
            correct = None
            explanation = ""

            for line in lines[1:]:
                line = line.strip()

                # Parse options
                if re.match(r'^[A-D]\)', line):
                    letter = line[0]
                    text = line[2:].strip()
                    options[letter] = text

                # Parse correct answer
                elif line.startswith('CORRECT:'):
                    correct = line.split(':', 1)[1].strip().upper()[0]

                # Parse explanation
                elif line.startswith('EXPLANATION:'):
                    explanation = line.split(':', 1)[1].strip()

            if question_text and len(options) == 4 and correct:
                questions.append({
                    'type': 'multiple_choice',
                    'question': question_text,
                    'options': options,
                    'correct_answer': correct,
                    'explanation': explanation
                })

        except Exception as e:
            continue

    return questions


def _parse_true_false(text: str) -> List[Dict]:
    """Parse true/false questions from AI response"""
    questions = []

    sections = re.split(r'\n\s*Q:\s*', text)

    for section in sections[1:]:
        try:
            lines = section.strip().split('\n')
            question_text = lines[0].strip()

            answer = None
            explanation = ""

            for line in lines[1:]:
                line = line.strip()

                if line.startswith('ANSWER:'):
                    answer_text = line.split(':', 1)[1].strip().upper()
                    answer = 'TRUE' in answer_text

                elif line.startswith('EXPLANATION:'):
                    explanation = line.split(':', 1)[1].strip()

            if question_text and answer is not None:
                questions.append({
                    'type': 'true_false',
                    'question': question_text,
                    'correct_answer': answer,
                    'explanation': explanation
                })

        except Exception as e:
            continue

    return questions


def _parse_short_answer(text: str) -> List[Dict]:
    """Parse short answer questions from AI response"""
    questions = []

    sections = re.split(r'\n\s*Q:\s*', text)

    for section in sections[1:]:
        try:
            lines = section.strip().split('\n')
            question_text = lines[0].strip()

            sample_answer = ""
            key_points = ""

            for line in lines[1:]:
                line = line.strip()

                if line.startswith('SAMPLE_ANSWER:'):
                    sample_answer = line.split(':', 1)[1].strip()

                elif line.startswith('KEY_POINTS:'):
                    key_points = line.split(':', 1)[1].strip()

            if question_text and sample_answer:
                questions.append({
                    'type': 'short_answer',
                    'question': question_text,
                    'sample_answer': sample_answer,
                    'key_points': key_points
                })

        except Exception as e:
            continue

    return questions


def save_exam(exam_data: Dict, filename: str):
    """Save exam to JSON file"""
    import json
    from pathlib import Path
    import os
    
    # Get DATA_DIR from environment - should match main.py
    data_dir_str = os.environ.get('DATA_DIR')
    
    if data_dir_str:
        data_dir = Path(data_dir_str)
    else:
        # Fallback - match main.py's logic
        import sys
        if getattr(sys, 'frozen', False):
            # Production: use AppData
            import getpass
            username = getpass.getuser()
            data_dir = Path(f'C:/Users/{username}/AppData/Roaming/StudyFlow')
        else:
            # Development
            data_dir = Path(__file__).parent.parent / 'data'
    
    exams_dir = data_dir / "exams"
    exams_dir.mkdir(exist_ok=True, parents=True)
    
    filepath = exams_dir / filename
    
    print(f"Saving exam to: {filepath}")  # Debug logging
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(exam_data, f, indent=2, ensure_ascii=False)
    
    return str(filepath)


def load_exam(filename: str) -> Dict:
    """Load exam from JSON file"""
    import json
    from pathlib import Path
    import os
    
    # Get DATA_DIR from environment
    data_dir_str = os.environ.get('DATA_DIR')
    
    if data_dir_str:
        data_dir = Path(data_dir_str)
    else:
        # Fallback
        import sys
        if getattr(sys, 'frozen', False):
            # Production: use AppData
            import getpass
            username = getpass.getuser()
            data_dir = Path(f'C:/Users/{username}/AppData/Roaming/StudyFlow')
        else:
            # Development
            data_dir = Path(__file__).parent.parent / 'data'
    
    exams_dir = data_dir / "exams"
    filepath = exams_dir / filename
    
    print(f"Loading exam from: {filepath}")  
    
    if not filepath.exists():
        raise FileNotFoundError(f"Exam not found: {filepath}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def format_exam_for_print(exam_data: Dict) -> str:
    """Format exam as printable text"""
    output = []

    output.append("=" * 70)
    output.append(f"EXAM: {exam_data['title']}")
    output.append(f"Course: {exam_data['course']}")
    output.append(f"Questions: {len(exam_data['questions'])}")
    output.append(f"Type: {exam_data['exam_type']}")
    output.append("=" * 70)
    output.append("")

    for i, q in enumerate(exam_data['questions'], 1):
        output.append(f"Question {i}:")
        output.append(f"{q['question']}")
        output.append("")

        if q['type'] == 'multiple_choice':
            for letter, option in q['options'].items():
                output.append(f"  {letter}) {option}")
            output.append("")

        elif q['type'] == 'true_false':
            output.append("  [ ] TRUE")
            output.append("  [ ] FALSE")
            output.append("")

        elif q['type'] == 'short_answer':
            output.append("  Answer:")
            output.append("  " + "_" * 60)
            output.append("  " + "_" * 60)
            output.append("  " + "_" * 60)
            output.append("")

        output.append("-" * 70)
        output.append("")

    return "\n".join(output)


def format_answer_key(exam_data: Dict) -> str:
    """Format answer key for exam"""
    output = []

    output.append("=" * 70)
    output.append(f"ANSWER KEY: {exam_data['title']}")
    output.append("=" * 70)
    output.append("")

    for i, q in enumerate(exam_data['questions'], 1):
        output.append(f"Question {i}: {q['question'][:50]}...")

        if q['type'] == 'multiple_choice':
            output.append(f"  Answer: {q['correct_answer']}) {q['options'][q['correct_answer']]}")

        elif q['type'] == 'true_false':
            output.append(f"  Answer: {'TRUE' if q['correct_answer'] else 'FALSE'}")

        elif q['type'] == 'short_answer':
            output.append(f"  Sample Answer: {q['sample_answer']}")
            output.append(f"  Key Points: {q['key_points']}")

        if q.get('explanation'):
            output.append(f"  Explanation: {q['explanation']}")

        output.append("")

    return "\n".join(output)