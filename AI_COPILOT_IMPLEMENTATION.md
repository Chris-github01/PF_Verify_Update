# AI Copilot Implementation

## Overview

The AI Copilot has been enhanced to access comprehensive project data including quotes, line items, commercial information, quote intelligence, scope matrix, normalisation, and workflow status. It provides intelligent assistance by understanding the full context of your projects.

## Features

### Comprehensive Data Access

The Copilot now has access to:

- **Project Details**: Name, client, reference, status, trade
- **Quote History**: All imported quotes with revision tracking
- **Line Items**: Complete item details including descriptions, quantities, pricing
- **Service Classification**: AI-detected service types and fire protection systems
- **System Mapping**: Normalised systems and confidence scores
- **Scope Matrix**: Coverage analysis across suppliers
- **Quote Intelligence**: Risk factors, coverage scores, quality assessments
- **Award Reports**: Historical reports and recommendations
- **Workflow Status**: Progress tracking through all workflow steps

### Intelligent Conversations

The Copilot can:

- Answer questions about specific quote details and pricing
- Provide insights on supplier comparisons
- Explain workflow steps and guide next actions
- Analyze coverage gaps and variances
- Interpret commercial data and trends
- Navigate you to relevant sections automatically

### Context-Aware Responses

The Copilot maintains conversation history and uses:
- Current project context
- Organisation settings
- Quote analysis results
- Workflow progress status

## Implementation Details

### Architecture

```
CopilotDrawer (UI Component)
    ↓
copilotAI.ts (AI Service Layer)
    ↓
copilotDataProvider.ts (Data Access Layer)
    ↓
Supabase Database
    ↓
Edge Function: copilot_chat
    ↓
OpenAI API
```

### Key Files

1. **`src/lib/copilot/copilotDataProvider.ts`**
   - Fetches comprehensive project data
   - Formats data for AI consumption
   - Provides organisation context

2. **`src/lib/copilot/copilotAI.ts`**
   - Manages AI conversations
   - Handles message formatting
   - Provides fallback responses

3. **`src/components/CopilotDrawer.tsx`**
   - UI component for chat interface
   - Manages conversation state
   - Handles navigation actions

4. **`supabase/functions/copilot_chat/index.ts`**
   - Edge function for AI API calls
   - Interfaces with OpenAI
   - Manages error handling

### Data Flow

1. **Project Selection**: When a project is selected, the Copilot loads all relevant data
2. **User Message**: User types a question or request
3. **Context Building**: System prepares context including:
   - Organisation information
   - Project details
   - Quote data
   - Workflow status
4. **AI Processing**: Message is sent to OpenAI with full context
5. **Response**: AI provides intelligent, context-aware response
6. **Navigation**: If requested, automatically navigates to relevant section

## Configuration

### Required Environment Variables

The following environment variable must be set in Supabase:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Edge Function Deployment

Deploy the copilot chat function:

```bash
supabase functions deploy copilot_chat
```

## Usage Examples

### Example Conversations

**Project Summary**
```
User: Give me a summary of this project
AI: This is the [Project Name] for [Client]. You have imported 3 quotes
    from suppliers with a total of 487 line items. The project is currently
    in the review stage with 85% of items classified...
```

**Price Comparison**
```
User: Which supplier has the best price?
AI: Based on the award report, Supplier A offers the most competitive total
    at $125,450 with 92% coverage. However, Supplier B has better pricing
    on fire stopping systems specifically...
```

**Coverage Analysis**
```
User: Are there any gaps in coverage?
AI: Yes, I've identified 3 systems with incomplete coverage:
    1. Pipe Penetrations - only 2 of 3 suppliers quoted
    2. Duct Penetrations - missing from Supplier C
    3. Cable Tray - only in Supplier A's quote...
```

**Workflow Guidance**
```
User: What should I do next?
AI: You've completed the quote import and review. The next recommended
    step is to run Quote Intelligence to analyze service types and risk
    factors. Would you like me to navigate you there?
```

**Navigation**
```
User: Show me the scope matrix
AI: I'll take you to the Scope Matrix now. This view will show you a
    side-by-side comparison of all suppliers' pricing...
    [Automatically navigates to scope matrix]
```

## Features by Workflow Step

### 1. Import Quotes
- Guidance on file upload
- Troubleshooting parsing issues
- Understanding extracted data

### 2. Review & Clean
- Verifying item details
- Classification assistance
- Data correction tips

### 3. Quote Intelligence
- Explaining AI analysis
- Interpreting risk factors
- Understanding service types

### 4. Scope Matrix
- Coverage analysis
- Price variance insights
- Gap identification

### 5. Equalisation
- Unit normalisation explanation
- Adjustment recommendations

### 6. Reports
- Award report interpretation
- Supplier recommendations
- Commercial insights

### 7. Contract Manager
- Document preparation guidance
- Pre-let appendix details

## Advanced Capabilities

### Multi-Turn Conversations

The Copilot maintains conversation history, allowing for:
- Follow-up questions
- Reference to previous answers
- Contextual clarifications

### Intelligent Navigation

The Copilot can automatically navigate you to relevant sections when:
- You ask to see specific data
- You request to perform actions
- Workflow guidance suggests next steps

### Fallback Handling

If the AI service is unavailable, the Copilot provides:
- Helpful fallback responses
- Guidance based on keywords
- Navigation to relevant sections

## Performance Considerations

### Data Loading

- Project data loads when the Copilot drawer opens
- Cached for the session duration
- Reloads when project changes

### Token Usage

The Copilot is optimized to:
- Send only relevant context
- Summarize large datasets
- Limit conversation history to recent messages

### Response Time

Typical response times:
- With AI service: 2-4 seconds
- Fallback mode: Instant

## Limitations

1. **Project Context Required**: Most questions require an active project selection
2. **AI Service Dependency**: Full capabilities require OpenAI API access
3. **Data Size**: Very large projects (1000+ items) may have summarized context
4. **Real-time Updates**: Data refreshes when drawer opens, not live

## Future Enhancements

Potential improvements:
- Voice input/output
- Proactive insights and alerts
- Learning from user preferences
- Integration with external data sources
- Multi-language support
- Export conversation history

## Troubleshooting

### Copilot Not Responding

1. Check that OPENAI_API_KEY is configured
2. Verify edge function is deployed
3. Check browser console for errors
4. Ensure project data loaded successfully

### Inaccurate Responses

1. Verify project data is up to date
2. Check that items are properly classified
3. Ensure quotes are imported correctly
4. Review conversation context

### Navigation Not Working

1. Confirm project is selected
2. Check that workflow step exists
3. Verify navigation handlers in App.tsx

## Support

For issues or questions:
- Check console logs for detailed error messages
- Review edge function logs in Supabase
- Verify all environment variables are set
- Test with fallback responses first
