"""Corpus v1 synthetic brief; run only when intentionally updating golden inputs.

Reuses the existing reportlab fixture approach. Does not overwrite earlier fixtures.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

target = Path(__file__).resolve().parent.parent / 'tests/corpus/v1/project-brief.pdf'
pages = [
    ['Fictional company: Qinghe Technology. Project: ORCHID-7421.',
     'Background: deliver an evidence-backed AI project assistant.',
     'Scope: chat, PDF Q&A, meeting tasks, memory, search and PPT.',
     'Project owner: Dr. Mira Qiao. Delivery coordinator: Lin Lan.',
     'Supplier contact: Zhou Ning. No production release date approved.'],
    ['Planning snapshot: 2026-11-01.',
     'Pilot target: 2026-11-20; conditional on dependency verification.',
     'Meeting location: Nanjing Room Cedar-17.',
     'Constraints: private files, evidence-based facts, no automatic email.',
     'Budget and launch code are in rag-project.pdf page 2.',
     'A target is not a completed milestone or release approval.'],
]
pdf = canvas.Canvas(str(target), pagesize=A4, invariant=1)
pdf.setTitle('Corpus v1 - synthetic ORCHID-7421 brief')
for number, lines in enumerate(pages, 1):
    pdf.setFont('Helvetica-Bold', 16)
    pdf.drawString(48, 790, 'Corpus v1 - Synthetic AI Delivery Project')
    pdf.setFont('Helvetica', 11)
    for i, line in enumerate(lines):
        pdf.drawString(48, 735 - i * 30, line)
    pdf.drawString(48, 45, f'Synthetic data only | Page {number}')
    pdf.showPage()
pdf.save()
print('Generated synthetic corpus brief (2 pages); no services used.')
