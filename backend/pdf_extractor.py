import fitz  
from pathlib import Path


def extract_text_from_pdf(pdf_path: str) -> dict:
    """
    Extract text from a PDF file

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Dictionary containing:
        - full_text: Complete text from all pages
        - pages: List of text per page
        - metadata: PDF metadata (title, author, etc.)
        - page_count: Number of pages
    """
    try:
        # Open the PDF
        doc = fitz.open(pdf_path)

        # Extract metadata
        metadata = {
            "title": doc.metadata.get("title", "Unknown"),
            "author": doc.metadata.get("author", "Unknown"),
            "subject": doc.metadata.get("subject", ""),
            "creator": doc.metadata.get("creator", ""),
        }

        # Extract text from each page
        pages = []
        full_text = ""

        for page_num, page in enumerate(doc, start=1):
            page_text = page.get_text()
            pages.append({
                "page_number": page_num,
                "text": page_text
            })
            full_text += f"\n--- Page {page_num} ---\n{page_text}"

        doc.close()

        return {
            "success": True,
            "full_text": full_text.strip(),
            "pages": pages,
            "metadata": metadata,
            "page_count": len(pages),
            "filename": Path(pdf_path).name
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "full_text": "",
            "pages": [],
            "metadata": {},
            "page_count": 0
        }

