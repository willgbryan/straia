# from langchain.globals import set_debug
# set_debug(True)
# from langchain.globals import set_verbose
# set_verbose(True)

import json
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict
from decouple import config
from api.llms import initialize_llm
from api.chains.stream.python_edit import create_python_edit_stream_query_chain
from api.chains.stream.sql_edit import create_sql_edit_stream_query_chain
from api.chains.stream.analyst_clarifications import create_analyst_clarifications_stream_chain
from api.chains.stream.analyst_analysis import create_analyst_analysis_stream_chain
import secrets


app = FastAPI()

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, config("BASIC_AUTH_USERNAME"))
    correct_password = secrets.compare_digest(credentials.password, config("BASIC_AUTH_PASSWORD"))
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


class SQLEditInputData(BaseModel):
    query: str
    instructions: str
    dialect: str
    tableInfo: Optional[str] = None
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None

@app.post("/v1/stream/sql/edit")
async def v1_steam_sql_edit(data: SQLEditInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_sql_edit_stream_query_chain(llm, data.dialect, data.tableInfo)

    async def generate():
        async for result in chain.astream({"query": data.query, "instructions": data.instructions}):
            yield json.dumps(result) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

class PythonEditInputData(BaseModel):
    source: str
    instructions: str
    allowedLibraries: List[str]
    variables: str
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None


@app.post("/v1/stream/python/edit")
async def v1_stream_python_edit(data: PythonEditInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_python_edit_stream_query_chain(llm)

    async def generate():
        stream = chain.astream({
            "source": data.source,
            "instructions": data.instructions,
            "allowed_libraries": data.allowedLibraries,
            "variables": data.variables
        })
        async for result in stream:
            yield json.dumps(result) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

class AnalystClarificationsInputData(BaseModel):
    question: str
    context: str
    goal: str
    databaseSchema: str
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None

@app.post("/v1/stream/analyst/clarifications")
async def v1_stream_analyst_clarifications(data: AnalystClarificationsInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_analyst_clarifications_stream_chain(llm)

    async def generate():
        stream = chain.astream({
            "database_schema": data.databaseSchema,
            "question": data.question,
            "context": data.context,
            "goal": data.goal
        })
        async for result in stream:
            # Parse the result as JSON to validate it
            try:
                # Ensure the result can be parsed as JSON
                json.loads(result)
                yield json.dumps(result) + "\n"
            except json.JSONDecodeError:
                # If the result is not valid JSON, yield the raw result
                yield json.dumps({"clarifications": []}) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

class AnalystAnalysisInputData(BaseModel):
    question: str
    context: str
    goal: str
    clarifications: Dict[str, str]  # Map of clarification IDs to selected option values
    databaseSchema: str
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None

@app.post("/v1/stream/analyst/analysis")
async def v1_stream_analyst_analysis(data: AnalystAnalysisInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_analyst_analysis_stream_chain(llm)
    
    # Convert clarifications to a JSON string
    clarifications_json = json.dumps(data.clarifications)

    async def generate():
        stream = chain.astream({
            "database_schema": data.databaseSchema,
            "question": data.question,
            "context": data.context,
            "goal": data.goal,
            "clarifications_json": clarifications_json
        })
        async for result in stream:
            # Parse the result as JSON to validate it
            try:
                # Ensure the result contains the expected fields
                parsed = json.loads(result)
                if all(key in parsed for key in ["summary", "visualizations", "methodologyNote"]):
                    yield json.dumps(parsed) + "\n"
                else:
                    # If any required field is missing, yield a placeholder
                    yield json.dumps({
                        "summary": "Analysis could not be generated.",
                        "visualizations": [],
                        "methodologyNote": "There was an error processing the data."
                    }) + "\n"
            except json.JSONDecodeError:
                # If the result is not valid JSON, yield a placeholder
                yield json.dumps({
                    "summary": "Analysis could not be generated.",
                    "visualizations": [],
                    "methodologyNote": "There was an error processing the data."
                }) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

@app.get("/ping")
async def ping():
    return "pong"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
