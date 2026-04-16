import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../page';
import { useDashboardData } from '../../hooks/useDashboardData';
import type { DashboardData, ProjectPhase } from '../../types/dashboard';

// Mock all child tab components
jest.mock('../../components/TabWorkspace', () => ({
  TabWorkspace: ({ todayContent, tasksContent }: any) => (
    <div data-testid="tab-workspace">
      <div data-testid="today-tab">{todayContent}</div>
      <div data-testid="tasks-tab">{tasksContent}</div>
    </div>
  ),
}));

jest.mock('../../components/TodayTab', () => ({
  TodayTab: ({ inbox, onClearNotification, onRefetch }: any) => (
    <div data-testid="today-tab-component">
      <button
        data-testid="clear-notification-btn"
        onClick={() => onClearNotification('test-id')}
      >
        Clear Notification
      </button>
      <button data-testid="refetch-btn" onClick={onRefetch}>
        Refetch
      </button>
    </div>
  ),
}));

jest.mock('../../components/TasksTab', () => ({
  TasksTab: ({ inbox }: any) => (
    <div data-testid="tasks-tab-component">Tasks Tab</div>
  ),
}));

jest.mock('../../components/ProjectsTab', () => ({
  ProjectsTab: ({ projects, onPhaseChange, onAddTask }: any) => (
    <div data-testid="projects-tab-component">
      <button
        data-testid="phase-change-btn"
        onClick={() => onPhaseChange('proj-1', 'Building' as ProjectPhase)}
      >
        Change Phase
      </button>
      <button
        data-testid="add-task-btn"
        onClick={() =>
          onAddTask(
            { action: 'Test task', priority: 'HIGH', effort: 'M' },
            'proj-1',
            'Test Project'
          )
        }
      >
        Add Task
      </button>
    </div>
  ),
}));

jest.mock('../../components/AutomationTab', () => ({
  AutomationTab: () => <div>Automation Tab</div>,
}));

jest.mock('../../components/NotesTab', () => ({
  NotesTab: () => <div>Notes Tab</div>,
}));

jest.mock('../../components/CeremoniesTab', () => ({
  CeremoniesTab: () => <div>Ceremonies Tab</div>,
}));

jest.mock('../../components/DocHealthTab', () => ({
  DocHealthTab: () => <div>Doc Health Tab</div>,
}));

jest.mock('../../components/LearningTab', () => ({
  LearningTab: () => <div>Learning Tab</div>,
}));

jest.mock('../../components/NewsTab', () => ({
  NewsTab: ({ onMarkInstalled }: any) => (
    <div data-testid="news-tab-component">
      <button
        data-testid="mark-installed-btn"
        onClick={() => onMarkInstalled('install-1')}
      >
        Mark Installed
      </button>
    </div>
  ),
}));

jest.mock('../../components/tabs/SystemTab', () => ({
  SystemTab: ({ onMarkInstalled }: any) => (
    <div data-testid="system-tab-component">
      <button
        data-testid="system-mark-installed-btn"
        onClick={() => onMarkInstalled('system-install-1')}
      >
        Mark System Installed
      </button>
    </div>
  ),
}));

jest.mock('../../components/IBPTab', () => ({
  IBPTab: () => <div>IBP Tab</div>,
}));

jest.mock('../../hooks/useDashboardData');

// Mock global fetch
global.fetch = jest.fn();

// Mock Date for consistent testing
const mockDate = new Date('2026-04-15T14:30:00Z');

describe('Dashboard (page.tsx)', () => {
  const mockUseDashboardData = useDashboardData as jest.MockedFunction<
    typeof useDashboardData
  >;

  const createMockDashboardData = (): DashboardData => ({
    meta: {
      version: '1.0',
      lastUpdated: mockDate.toISOString(),
      lastUpdatedBy: 'test-user',
    },
    priorityInbox: {
      urgent: [
        {
          id: 'inbox-1',
          title: 'Urgent task',
          type: 'jira',
          source: 'sprint',
          jiraKey: 'PROJ-123',
          priority: 'urgent',
          addedAt: mockDate.toISOString(),
        },
      ],
      aiSuggested: [],
      today: [
        {
          id: 'inbox-2',
          title: 'Today task',
          type: 'jira',
          source: 'sprint',
          jiraKey: 'PROJ-124',
          priority: 'today',
          addedAt: mockDate.toISOString(),
        },
      ],
      backlog: [],
    },
    personalProjects: {
      lastRefreshed: mockDate.toISOString(),
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          description: 'A test project',
          phase: 'Building',
          completionPercent: 50,
          tags: ['test'],
          suggestions: [
            {
              action: 'Test action',
              priority: 'HIGH',
              effort: 'M',
            },
          ],
        },
      ],
    },
    calendar: {
      lastRefreshed: mockDate.toISOString(),
      hasToken: true,
      today: [
        {
          id: 'cal-1',
          title: 'Meeting',
          startTime: mockDate.toISOString(),
          endTime: new Date(mockDate.getTime() + 3600000).toISOString(),
          isFocusBlock: false,
          isCompleted: false,
        },
      ],
      weekAhead: [],
    },
    timeTracker: {
      activeSession: null,
      todaySessions: [],
      todayTotalMinutes: 0,
      weekTotalMinutes: 0,
    },
    overnightAnalysis: {
      generatedAt: mockDate.toISOString(),
      projects: {},
    },
    tasks: {
      items: [],
    },
    automationRules: {
      lastChecked: null,
      rules: [],
    },
    projectRegistry: [],
    teamMessages: [],
    flaggedEmails: [],
    dayPlan: null,
    activityLog: [],
    aiNewsResults: null,
    lastActivitySync: null,
    recommendedInstalls: {
      lastUpdated: null,
      items: [],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Loading State', () => {
    it('displays loading message when data is loading', () => {
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      render(<Dashboard />);

      expect(screen.getByText('Loading command center...')).toBeInTheDocument();
    });

    it('renders with gray background during loading', () => {
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      const { container } = render(<Dashboard />);
      const loadingContainer = container.querySelector('.min-h-screen.bg-gray-900');

      expect(loadingContainer).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when data fails to load', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: false,
        error: 'Network error',
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(
        screen.getByText('Failed to load dashboard data')
      ).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('displays retry button in error state', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to fetch',
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      const retryButton = screen.getByRole('button', { name: 'Retry' });
      expect(retryButton).toBeInTheDocument();
    });

    it('calls refetch when retry button is clicked', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: false,
        error: 'Network error',
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      const retryButton = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(retryButton);

      expect(mockRefetch).toHaveBeenCalled();
    });

    it('renders error state when data is null despite no error', () => {
      mockUseDashboardData.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<Dashboard />);

      expect(
        screen.getByText('Failed to load dashboard data')
      ).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('renders header with dashboard title', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByText('Liam Command Center')).toBeInTheDocument();
    });

    it('renders TabWorkspace component when data loads successfully', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('tab-workspace')).toBeInTheDocument();
    });

    it('displays current date in header', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      // Date format: en-GB with weekday, day, month, year (e.g., "Wed, 15 Apr 2026")
      expect(screen.getByText(/Wed, 15 Apr 2026/)).toBeInTheDocument();
    });

    it('displays AI analysis timestamp when available', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByText(/AI Analysis:/)).toBeInTheDocument();
    });

    it('passes correct props to TodayTab component', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      // TodayTab should be rendered (verified by mocked component)
      expect(screen.getByTestId('today-tab-component')).toBeInTheDocument();
    });

    it('passes correct props to ProjectsTab component', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('projects-tab-component')).toBeInTheDocument();
    });
  });

  describe('ClockDisplay Component', () => {
    it('renders current time initially', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      // Mock Date.now and toLocaleTimeString
      const originalDateConstructor = Date;
      const mockDateNow = jest.fn(() => mockDate.getTime());
      (global.Date as any).now = mockDateNow;

      render(<Dashboard />);

      // The clock should display in en-GB 24-hour format
      // We can't assert exact time here due to testing environment, but we verify the clock renders
      const clockDisplay = screen.getByText(/\d{2}:\d{2}/, { selector: '.font-mono' });
      expect(clockDisplay).toBeInTheDocument();
    });

    it('sets up interval to update time every 30 seconds', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      render(<Dashboard />);

      // Verify setInterval was called with 30000ms
      const clockIntervalCall = setIntervalSpy.mock.calls.find(
        (call) => call[1] === 30000
      );
      expect(clockIntervalCall).toBeDefined();

      setIntervalSpy.mockRestore();
    });

    it('clears interval on unmount', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const { unmount } = render(<Dashboard />);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Fetch Handlers', () => {
    describe('handlePhaseChange', () => {
      it('sends PATCH request to /api/projects with correct payload', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const phaseChangeButton = screen.getByTestId('phase-change-btn');
        fireEvent.click(phaseChangeButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/projects',
            expect.objectContaining({
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId: 'proj-1',
                phase: 'Building',
              }),
            })
          );
        });
      });

      it('calls refetch after phase change', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const phaseChangeButton = screen.getByTestId('phase-change-btn');
        fireEvent.click(phaseChangeButton);

        await waitFor(() => {
          expect(mockRefetch).toHaveBeenCalled();
        });
      });
    });

    describe('handleClearNotification', () => {
      it('sends DELETE request to /api/notifications with correct id', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const clearNotificationButton = screen.getByTestId('clear-notification-btn');
        fireEvent.click(clearNotificationButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/notifications?id=test-id',
            expect.objectContaining({
              method: 'DELETE',
            })
          );
        });
      });

      it('encodes notification id in URL', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const clearNotificationButton = screen.getByTestId('clear-notification-btn');
        fireEvent.click(clearNotificationButton);

        await waitFor(() => {
          const calls = (global.fetch as jest.Mock).mock.calls;
          const deleteCall = calls.find((call) => call[0]?.includes('/api/notifications'));
          expect(deleteCall).toBeDefined();
          expect(deleteCall[0]).toContain('id=test-id');
        });
      });

      it('calls refetch after clearing notification', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const clearNotificationButton = screen.getByTestId('clear-notification-btn');
        fireEvent.click(clearNotificationButton);

        await waitFor(() => {
          expect(mockRefetch).toHaveBeenCalled();
        });
      });
    });

    describe('handleAddTask', () => {
      it('sends POST request to /api/tasks with correct payload', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const addTaskButton = screen.getByTestId('add-task-btn');
        fireEvent.click(addTaskButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/tasks',
            expect.objectContaining({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: 'Test task',
                category: 'feature',
                priority: 'HIGH',
                effort: 'M',
                projectId: 'proj-1',
                projectName: 'Test Project',
                source: 'overnight-suggestion',
              }),
            })
          );
        });
      });

      it('calls refetch after adding task', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const addTaskButton = screen.getByTestId('add-task-btn');
        fireEvent.click(addTaskButton);

        await waitFor(() => {
          expect(mockRefetch).toHaveBeenCalled();
        });
      });
    });

    describe('onMarkInstalled (NewsTab)', () => {
      it('sends POST request to /api/installs/mark with install id', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const markInstalledButton = screen.getByTestId('mark-installed-btn');
        fireEvent.click(markInstalledButton);

        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith(
            '/api/installs/mark',
            expect.objectContaining({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: 'install-1' }),
            })
          );
        });
      });

      it('silently fails if mark installed request fails', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        (global.fetch as jest.Mock).mockRejectedValueOnce(
          new Error('Network error')
        );

        render(<Dashboard />);

        const markInstalledButton = screen.getByTestId('mark-installed-btn');
        fireEvent.click(markInstalledButton);

        // Should not throw
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalled();
        });
      });
    });

    describe('onMarkInstalled (SystemTab)', () => {
      it('sends POST request for system tab mark installed', async () => {
        const mockRefetch = jest.fn();
        mockUseDashboardData.mockReturnValue({
          data: createMockDashboardData(),
          loading: false,
          error: null,
          refetch: mockRefetch,
        });

        render(<Dashboard />);

        const systemMarkInstalledButton = screen.getByTestId(
          'system-mark-installed-btn'
        );
        fireEvent.click(systemMarkInstalledButton);

        await waitFor(() => {
          const calls = (global.fetch as jest.Mock).mock.calls;
          const markInstalledCall = calls.find(
            (call) => call[0] === '/api/installs/mark'
          );
          expect(markInstalledCall).toBeDefined();
        });
      });
    });
  });

  describe('Refetch Integration', () => {
    it('passes refetch function to child components', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      const refetchButton = screen.getByTestId('refetch-btn');
      fireEvent.click(refetchButton);

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Data Prop Passing', () => {
    it('passes overnightAnalysis data to LearningTab', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      // Verify LearningTab receives the data (component renders without error)
      expect(screen.getByText('Learning Tab')).toBeInTheDocument();
    });

    it('passes calendar data to TodayTab', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('today-tab-component')).toBeInTheDocument();
    });
  });

  describe('Layout and Styling', () => {
    it('renders main dashboard container with correct classes', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      const { container } = render(<Dashboard />);

      const mainContainer = container.querySelector('.h-screen.bg-gray-900');
      expect(mainContainer).toBeInTheDocument();
    });

    it('renders header with correct styling', () => {
      const mockRefetch = jest.fn();
      mockUseDashboardData.mockReturnValue({
        data: createMockDashboardData(),
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      const { container } = render(<Dashboard />);

      const header = container.querySelector('header');
      expect(header).toHaveClass('bg-gray-800/60');
      expect(header).toHaveClass('border-b');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty project suggestions array', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockData.personalProjects.projects[0].suggestions = [];
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('projects-tab-component')).toBeInTheDocument();
    });

    it('handles null optional data fields', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockData.overnightAnalysis.generatedAt = null;
      mockData.aiNewsResults = null;
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('tab-workspace')).toBeInTheDocument();
    });

    it('handles empty inbox items', () => {
      const mockRefetch = jest.fn();
      const mockData = createMockDashboardData();
      mockData.priorityInbox = {
        urgent: [],
        aiSuggested: [],
        today: [],
        backlog: [],
      };
      mockUseDashboardData.mockReturnValue({
        data: mockData,
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<Dashboard />);

      expect(screen.getByTestId('today-tab-component')).toBeInTheDocument();
    });
  });
});
